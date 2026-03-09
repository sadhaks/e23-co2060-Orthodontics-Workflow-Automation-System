const { 
  findOne, 
  findMany, 
  insert, 
  update, 
  remove,
  query
} = require('../config/database');
const { logAuditEvent } = require('../middleware/errorHandler');
const { getFileInfo } = require('../middleware/upload');
const path = require('path');
const fs = require('fs').promises;

// Get documents for a patient
const getPatientDocuments = async (req, res) => {
  try {
    const { patientId } = req.params;
    const { page = 1, limit = 10, type, deleted = 'active' } = req.query;
    const offset = (page - 1) * limit;

    // Check if patient exists
    const patient = await findOne('patients', { id: patientId, deleted_at: null });
    if (!patient) {
      return res.status(404).json({
        success: false,
        message: 'Patient not found'
      });
    }

    const deletedMode = String(deleted || 'active').toLowerCase();
    if ((deletedMode === 'trashed' || deletedMode === 'all') && req.user.role !== 'ORTHODONTIST') {
      return res.status(403).json({
        success: false,
        message: 'Only assigned orthodontist can access trash'
      });
    }

    let whereClause = 'WHERE md.patient_id = ?';
    let queryParams = [patientId];

    if (deletedMode === 'trashed') {
      whereClause += ' AND md.deleted_at IS NOT NULL';
    } else if (deletedMode === 'all') {
      // no deleted filter
    } else {
      whereClause += ' AND md.deleted_at IS NULL';
    }

    if (type) {
      whereClause += ' AND md.type = ?';
      queryParams.push(type);
    }

    // Get total count
    const countQuery = `
      SELECT COUNT(*) as total 
      FROM medical_documents md
      ${whereClause}
    `;
    const totalResult = await query(countQuery, queryParams);
    const total = totalResult[0].total;

    // Get documents with uploader details
    const documentsQuery = `
      SELECT 
        md.*,
        u.name as uploaded_by_name,
        u.role as uploaded_by_role,
        du.name as deleted_by_name
      FROM medical_documents md
      LEFT JOIN users u ON md.uploaded_by = u.id
      LEFT JOIN users du ON md.deleted_by = du.id
      ${whereClause}
      ORDER BY md.created_at DESC
      LIMIT ? OFFSET ?
    `;
    queryParams.push(parseInt(limit), offset);

    const documents = await query(documentsQuery, queryParams);

    res.json({
      success: true,
      data: {
        documents,
        pagination: {
          current_page: parseInt(page),
          total_pages: Math.ceil(total / limit),
          total_records: total,
          limit: parseInt(limit)
        }
      }
    });
  } catch (error) {
    console.error('Get patient documents error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
};

// Upload document for patient
const uploadDocument = async (req, res) => {
  try {
    const { patientId } = req.params;
    const { type, description } = req.body;

    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: 'No file uploaded'
      });
    }

    // Check if patient exists
    const patient = await findOne('patients', { id: patientId, deleted_at: null });
    if (!patient) {
      return res.status(404).json({
        success: false,
        message: 'Patient not found'
      });
    }

    // Validate document type
    const validTypes = ['RADIOGRAPH', 'NOTE', 'SCAN', 'PHOTO'];
    if (!validTypes.includes(type)) {
      // Clean up uploaded file
      await fs.unlink(req.file.path).catch(() => {});
      return res.status(400).json({
        success: false,
        message: 'Invalid document type'
      });
    }

    // Prepare document data
    const fileInfo = getFileInfo(req.file);
    const documentData = {
      patient_id: patientId,
      uploaded_by: req.user.id,
      type,
      file_path: fileInfo.path,
      original_filename: fileInfo.originalname,
      file_size: fileInfo.size,
      mime_type: fileInfo.mimetype,
      description: description || null
    };

    // Insert document record
    const documentId = await insert('medical_documents', documentData);

    await logAuditEvent(req.user.id, 'UPLOAD', 'MEDICAL_DOCUMENT', documentId, null, {
      patient_id: patientId,
      type,
      filename: fileInfo.originalname,
      file_size: fileInfo.size
    });

    // Return created document with details
    const createdDocumentQuery = `
      SELECT 
        md.*,
        u.name as uploaded_by_name,
        u.role as uploaded_by_role
      FROM medical_documents md
      LEFT JOIN users u ON md.uploaded_by = u.id
      WHERE md.id = ?
    `;

    const createdDocuments = await query(createdDocumentQuery, [documentId]);

    res.status(201).json({
      success: true,
      message: 'Document uploaded successfully',
      data: createdDocuments[0]
    });
  } catch (error) {
    console.error('Upload document error:', error);
    
    // Clean up uploaded file on error
    if (req.file) {
      await fs.unlink(req.file.path).catch(() => {});
    }

    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
};

// Get single document by ID
const getDocumentById = async (req, res) => {
  try {
    const { id } = req.params;

    const documentQuery = `
      SELECT 
        md.*,
        p.patient_code,
        CONCAT(p.first_name, ' ', p.last_name) as patient_name,
        u.name as uploaded_by_name,
        u.role as uploaded_by_role
      FROM medical_documents md
      LEFT JOIN patients p ON md.patient_id = p.id
      LEFT JOIN users u ON md.uploaded_by = u.id
      WHERE md.id = ?
        AND md.deleted_at IS NULL
    `;

    const documents = await query(documentQuery, [id]);

    if (documents.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Document not found'
      });
    }

    res.json({
      success: true,
      data: documents[0]
    });
  } catch (error) {
    console.error('Get document error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
};

// Download document
const downloadDocument = async (req, res) => {
  try {
    const { id } = req.params;

    // Get document info
    const document = await findOne('medical_documents', { id, deleted_at: null });
    
    if (!document) {
      return res.status(404).json({
        success: false,
        message: 'Document not found'
      });
    }

    // Check if file exists
    try {
      await fs.access(document.file_path);
    } catch {
      return res.status(404).json({
        success: false,
        message: 'File not found on server'
      });
    }

    // Set appropriate headers
    res.setHeader('Content-Type', document.mime_type);
    res.setHeader('Content-Disposition', `attachment; filename="${document.original_filename}"`);
    res.setHeader('Content-Length', document.file_size);

    // Send file
    const fileStream = require('fs').createReadStream(document.file_path);
    fileStream.pipe(res);

    // Log download
    await logAuditEvent(req.user.id, 'DOWNLOAD', 'MEDICAL_DOCUMENT', id, null, {
      filename: document.original_filename
    });
  } catch (error) {
    console.error('Download document error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
};

// Update document metadata
const updateDocument = async (req, res) => {
  try {
    const { id } = req.params;
    const { type, description } = req.body;

    // Check if document exists
    const existingDocument = await findOne('medical_documents', { id, deleted_at: null });
    if (!existingDocument) {
      return res.status(404).json({
        success: false,
        message: 'Document not found'
      });
    }

    const updateData = {};
    if (type) updateData.type = type;
    if (description !== undefined) updateData.description = description;

    if (Object.keys(updateData).length === 0) {
      return res.status(400).json({
        success: false,
        message: 'No fields to update'
      });
    }

    // Update document
    await update('medical_documents', updateData, { id });

    await logAuditEvent(req.user.id, 'UPDATE', 'MEDICAL_DOCUMENT', id, existingDocument, updateData);

    // Return updated document
    const updatedDocumentQuery = `
      SELECT 
        md.*,
        p.patient_code,
        CONCAT(p.first_name, ' ', p.last_name) as patient_name,
        u.name as uploaded_by_name,
        u.role as uploaded_by_role
      FROM medical_documents md
      LEFT JOIN patients p ON md.patient_id = p.id
      LEFT JOIN users u ON md.uploaded_by = u.id
      WHERE md.id = ?
    `;

    const updatedDocuments = await query(updatedDocumentQuery, [id]);

    res.json({
      success: true,
      message: 'Document updated successfully',
      data: updatedDocuments[0]
    });
  } catch (error) {
    console.error('Update document error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
};

// Delete document
const deleteDocument = async (req, res) => {
  try {
    const { id } = req.params;
    const permanent = String(req.query.permanent || '').toLowerCase() === 'true';

    // Check if document exists (including trashed rows)
    const rows = await query('SELECT * FROM medical_documents WHERE id = ? LIMIT 1', [id]);
    const existingDocument = rows[0];
    if (!existingDocument) {
      return res.status(404).json({
        success: false,
        message: 'Document not found'
      });
    }

    if (permanent) {
      if (!existingDocument.deleted_at) {
        return res.status(400).json({
          success: false,
          message: 'Document must be moved to trash before permanent deletion'
        });
      }

      try {
        await fs.unlink(existingDocument.file_path);
      } catch (error) {
        console.error('Failed to delete file:', error);
      }

      await remove('medical_documents', { id }, false);

      await logAuditEvent(req.user.id, 'HARD_DELETE', 'MEDICAL_DOCUMENT', id, existingDocument, null);

      return res.json({
        success: true,
        message: 'Document permanently deleted'
      });
    }

    if (existingDocument.deleted_at) {
      return res.status(400).json({
        success: false,
        message: 'Document already in trash'
      });
    }

    await update('medical_documents', { deleted_at: new Date(), deleted_by: req.user.id }, { id });

    await logAuditEvent(req.user.id, 'DELETE', 'MEDICAL_DOCUMENT', id, existingDocument, {
      deleted_at: new Date(),
      deleted_by: req.user.id
    });

    res.json({
      success: true,
      message: 'Document moved to trash'
    });
  } catch (error) {
    console.error('Delete document error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
};

// Restore document from trash
const restoreDocument = async (req, res) => {
  try {
    const { id } = req.params;

    const rows = await query('SELECT * FROM medical_documents WHERE id = ? LIMIT 1', [id]);
    const existingDocument = rows[0];
    if (!existingDocument) {
      return res.status(404).json({
        success: false,
        message: 'Document not found'
      });
    }

    if (!existingDocument.deleted_at) {
      return res.status(400).json({
        success: false,
        message: 'Document is not in trash'
      });
    }

    await update('medical_documents', { deleted_at: null, deleted_by: null }, { id });

    await logAuditEvent(req.user.id, 'RESTORE', 'MEDICAL_DOCUMENT', id, existingDocument, {
      deleted_at: null,
      deleted_by: null
    });

    res.json({
      success: true,
      message: 'Document restored successfully'
    });
  } catch (error) {
    console.error('Restore document error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
};

// Get document statistics
const getDocumentStats = async (req, res) => {
  try {
    const { period = 'month' } = req.query;

    let dateFilter;
    switch (period) {
      case 'week':
        dateFilter = 'DATE_SUB(NOW(), INTERVAL 1 WEEK)';
        break;
      case 'month':
        dateFilter = 'DATE_SUB(NOW(), INTERVAL 1 MONTH)';
        break;
      case 'year':
        dateFilter = 'DATE_SUB(NOW(), INTERVAL 1 YEAR)';
        break;
      default:
        dateFilter = 'DATE_SUB(NOW(), INTERVAL 1 MONTH)';
    }

    const statsQuery = `
      SELECT 
        COUNT(*) as total_documents,
        COUNT(CASE WHEN type = 'RADIOGRAPH' THEN 1 END) as radiographs,
        COUNT(CASE WHEN type = 'NOTE' THEN 1 END) as notes,
        COUNT(CASE WHEN type = 'SCAN' THEN 1 END) as scans,
        COUNT(CASE WHEN type = 'PHOTO' THEN 1 END) as photos,
        SUM(file_size) as total_file_size,
        AVG(file_size) as avg_file_size
      FROM medical_documents 
      WHERE created_at >= ${dateFilter}
        AND deleted_at IS NULL
    `;

    const stats = await query(statsQuery);

    // Monthly upload trends
    const monthlyTrendsQuery = `
      SELECT 
        DATE_FORMAT(created_at, '%Y-%m') as month,
        COUNT(*) as upload_count,
        SUM(file_size) as total_size
      FROM medical_documents 
      WHERE created_at >= DATE_SUB(NOW(), INTERVAL 12 MONTH)
        AND deleted_at IS NULL
      GROUP BY DATE_FORMAT(created_at, '%Y-%m')
      ORDER BY month ASC
    `;

    const monthlyTrends = await query(monthlyTrendsQuery);

    // Top uploaders
    const topUploadersQuery = `
      SELECT 
        u.name as uploader_name,
        u.role as uploader_role,
        COUNT(*) as upload_count,
        SUM(md.file_size) as total_size_uploaded
      FROM medical_documents md
      LEFT JOIN users u ON md.uploaded_by = u.id
      WHERE md.created_at >= ${dateFilter}
        AND md.deleted_at IS NULL
      GROUP BY md.uploaded_by, u.name, u.role
      ORDER BY upload_count DESC
      LIMIT 10
    `;

    const topUploaders = await query(topUploadersQuery);

    res.json({
      success: true,
      data: {
        overview: stats[0],
        monthly_trends: monthlyTrends,
        top_uploaders: topUploaders
      }
    });
  } catch (error) {
    console.error('Get document stats error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
};

module.exports = {
  getPatientDocuments,
  uploadDocument,
  getDocumentById,
  downloadDocument,
  updateDocument,
  deleteDocument,
  restoreDocument,
  getDocumentStats
};
