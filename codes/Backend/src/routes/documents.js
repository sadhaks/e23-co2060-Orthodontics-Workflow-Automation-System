const express = require('express');
const { validate, schemas } = require('../middleware/validation');
const { authenticate } = require('../middleware/auth');
const { asyncHandler } = require('../middleware/errorHandler');
const { uploadSingle, validateFile } = require('../middleware/upload');
const documentController = require('../controllers/documentController');
const { requirePermission, OBJECT_TYPES, PERMISSIONS } = require('../middleware/accessControl');
const { query } = require('../config/database');

const router = express.Router();

// Apply authentication to all routes
router.use(authenticate);

const resolvePatientIdFromDocumentId = async (req) => {
  const rows = await query('SELECT patient_id FROM medical_documents WHERE id = ? LIMIT 1', [req.params.id]);
  return rows[0]?.patient_id || null;
};

// GET /api/documents/stats - Get document statistics
router.get('/stats', 
  requirePermission(OBJECT_TYPES.PATIENT_RADIOGRAPHS, PERMISSIONS.READ),
  asyncHandler(documentController.getDocumentStats)
);

// GET /api/documents/:id - Get single document by ID
router.get('/:id', 
  requirePermission(OBJECT_TYPES.PATIENT_RADIOGRAPHS, PERMISSIONS.READ, { resolvePatientId: resolvePatientIdFromDocumentId }),
  asyncHandler(documentController.getDocumentById)
);

// GET /api/documents/:id/download - Download document
router.get('/:id/download', 
  requirePermission(OBJECT_TYPES.PATIENT_RADIOGRAPHS, PERMISSIONS.READ, { resolvePatientId: resolvePatientIdFromDocumentId }),
  asyncHandler(documentController.downloadDocument)
);

// PUT /api/documents/:id - Update document metadata
router.put('/:id', 
  requirePermission(OBJECT_TYPES.PATIENT_RADIOGRAPHS, PERMISSIONS.UPDATE, { resolvePatientId: resolvePatientIdFromDocumentId }),
  asyncHandler(documentController.updateDocument)
);

// DELETE /api/documents/:id - Delete document
router.delete('/:id', 
  requirePermission(OBJECT_TYPES.PATIENT_RADIOGRAPHS, PERMISSIONS.DELETE, { resolvePatientId: resolvePatientIdFromDocumentId }),
  asyncHandler(documentController.deleteDocument)
);

// PUT /api/documents/:id/restore - Restore document from trash
router.put('/:id/restore',
  requirePermission(OBJECT_TYPES.PATIENT_RADIOGRAPHS, PERMISSIONS.DELETE, { resolvePatientId: resolvePatientIdFromDocumentId }),
  asyncHandler(documentController.restoreDocument)
);

// GET /api/patients/:patientId/documents - Get documents for a patient
router.get('/patients/:patientId', 
  requirePermission(OBJECT_TYPES.PATIENT_RADIOGRAPHS, PERMISSIONS.READ),
  validate(schemas.pagination, 'query'),
  asyncHandler(documentController.getPatientDocuments)
);

// POST /api/patients/:patientId/documents - Upload document for patient
router.post('/patients/:patientId', 
  requirePermission(OBJECT_TYPES.PATIENT_RADIOGRAPHS, PERMISSIONS.UPDATE),
  uploadSingle('document'),
  validateFile,
  asyncHandler(documentController.uploadDocument)
);

module.exports = router;
