const { 
  findOne, 
  findMany, 
  insert, 
  update, 
  remove,
  query
} = require('../config/database');
const { logAuditEvent } = require('../middleware/errorHandler');

// Get all cases (with filtering)
const getCases = async (req, res) => {
  try {
    const { 
      page = 1, 
      limit = 10, 
      status, 
      student_id,
      supervisor_id,
      search
    } = req.query;
    const offset = (page - 1) * limit;

    let whereClause = 'WHERE 1=1';
    let queryParams = [];

    if (status) {
      whereClause += ' AND c.status = ?';
      queryParams.push(status);
    }

    if (student_id) {
      whereClause += ' AND c.student_id = ?';
      queryParams.push(student_id);
    }

    if (supervisor_id) {
      whereClause += ' AND c.supervisor_id = ?';
      queryParams.push(supervisor_id);
    }

    if (search) {
      whereClause += ' AND (p.first_name LIKE ? OR p.last_name LIKE ? OR p.patient_code LIKE ?)';
      const searchTerm = `%${search}%`;
      queryParams.push(searchTerm, searchTerm, searchTerm);
    }

    // Get total count
    const countQuery = `
      SELECT COUNT(*) as total 
      FROM cases c
      LEFT JOIN patients p ON c.patient_id = p.id
      ${whereClause}
    `;
    const totalResult = await query(countQuery, queryParams);
    const total = totalResult[0].total;

    // Get cases with details
    const casesQuery = `
      SELECT 
        c.*,
        p.patient_code,
        CONCAT(p.first_name, ' ', p.last_name) as patient_name,
        TIMESTAMPDIFF(YEAR, p.date_of_birth, CURDATE()) as patient_age,
        p.gender as patient_gender,
        student.name as student_name,
        student.email as student_email,
        supervisor.name as supervisor_name,
        supervisor.email as supervisor_email
      FROM cases c
      LEFT JOIN patients p ON c.patient_id = p.id
      LEFT JOIN users student ON c.student_id = student.id
      LEFT JOIN users supervisor ON c.supervisor_id = supervisor.id
      ${whereClause}
      ORDER BY c.created_at DESC
      LIMIT ? OFFSET ?
    `;
    queryParams.push(parseInt(limit), offset);

    const cases = await query(casesQuery, queryParams);

    res.json({
      success: true,
      data: {
        cases,
        pagination: {
          current_page: parseInt(page),
          total_pages: Math.ceil(total / limit),
          total_records: total,
          limit: parseInt(limit)
        }
      }
    });
  } catch (error) {
    console.error('Get cases error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
};

// Get cases for a specific student
const getStudentCases = async (req, res) => {
  try {
    const { studentId } = req.params;
    const { page = 1, limit = 10, status } = req.query;
    const offset = (page - 1) * limit;

    // Check if student exists
    const student = await findOne('users', { id: studentId, role: 'STUDENT' });
    if (!student) {
      return res.status(404).json({
        success: false,
        message: 'Student not found'
      });
    }

    let whereClause = 'WHERE c.student_id = ?';
    let queryParams = [studentId];

    if (status) {
      whereClause += ' AND c.status = ?';
      queryParams.push(status);
    }

    // Get total count
    const countQuery = `
      SELECT COUNT(*) as total 
      FROM cases c
      ${whereClause}
    `;
    const totalResult = await query(countQuery, queryParams);
    const total = totalResult[0].total;

    // Get cases with details
    const casesQuery = `
      SELECT 
        c.*,
        p.patient_code,
        CONCAT(p.first_name, ' ', p.last_name) as patient_name,
        TIMESTAMPDIFF(YEAR, p.date_of_birth, CURDATE()) as patient_age,
        p.gender as patient_gender,
        supervisor.name as supervisor_name,
        supervisor.email as supervisor_email
      FROM cases c
      LEFT JOIN patients p ON c.patient_id = p.id
      LEFT JOIN users supervisor ON c.supervisor_id = supervisor.id
      ${whereClause}
      ORDER BY c.created_at DESC
      LIMIT ? OFFSET ?
    `;
    queryParams.push(parseInt(limit), offset);

    const cases = await query(casesQuery, queryParams);

    // Get student progress summary
    const progressQuery = `
      SELECT 
        COUNT(*) as total_cases,
        COUNT(CASE WHEN status = 'VERIFIED' THEN 1 END) as verified_cases,
        COUNT(CASE WHEN status = 'PENDING_VERIFICATION' THEN 1 END) as pending_cases,
        COUNT(CASE WHEN status = 'ASSIGNED' THEN 1 END) as assigned_cases,
        COUNT(CASE WHEN status = 'REJECTED' THEN 1 END) as rejected_cases
      FROM cases 
      WHERE student_id = ?
    `;
    const progress = await query(progressQuery, [studentId]);

    res.json({
      success: true,
      data: {
        cases,
        progress: progress[0],
        pagination: {
          current_page: parseInt(page),
          total_pages: Math.ceil(total / limit),
          total_records: total,
          limit: parseInt(limit)
        }
      }
    });
  } catch (error) {
    console.error('Get student cases error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
};

// Get single case by ID
const getCaseById = async (req, res) => {
  try {
    const { id } = req.params;

    const caseQuery = `
      SELECT 
        c.*,
        p.patient_code,
        CONCAT(p.first_name, ' ', p.last_name) as patient_name,
        p.date_of_birth as patient_dob,
        p.gender as patient_gender,
        p.phone as patient_phone,
        student.name as student_name,
        student.email as student_email,
        supervisor.name as supervisor_name,
        supervisor.email as supervisor_email
      FROM cases c
      LEFT JOIN patients p ON c.patient_id = p.id
      LEFT JOIN users student ON c.student_id = student.id
      LEFT JOIN users supervisor ON c.supervisor_id = supervisor.id
      WHERE c.id = ?
    `;

    const cases = await query(caseQuery, [id]);

    if (cases.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Case not found'
      });
    }

    const caseData = cases[0];
    caseData.patient_age = Math.floor((new Date() - new Date(caseData.patient_dob)) / (365.25 * 24 * 60 * 60 * 1000));

    // Get related clinical notes
    const notesQuery = `
      SELECT 
        cn.*,
        u.name as author_name
      FROM clinical_notes cn
      LEFT JOIN users u ON cn.author_id = u.id
      WHERE cn.patient_id = ?
      ORDER BY cn.created_at DESC
    `;
    const notes = await query(notesQuery, [caseData.patient_id]);

    // Get related visits
    const visitsQuery = `
      SELECT 
        v.*,
        u.name as provider_name
      FROM visits v
      LEFT JOIN users u ON v.provider_id = u.id
      WHERE v.patient_id = ?
      ORDER BY v.visit_date DESC
    `;
    const visits = await query(visitsQuery, [caseData.patient_id]);

    res.json({
      success: true,
      data: {
        case: caseData,
        clinical_notes: notes,
        visits: visits
      }
    });
  } catch (error) {
    console.error('Get case error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
};

// Create new case
const createCase = async (req, res) => {
  try {
    const caseData = req.body;

    // Check if patient exists
    const patient = await findOne('patients', { id: caseData.patient_id, deleted_at: null });
    if (!patient) {
      return res.status(404).json({
        success: false,
        message: 'Patient not found'
      });
    }

    // Check if student exists and is active
    const student = await findOne('users', { id: caseData.student_id, role: 'STUDENT', status: 'ACTIVE' });
    if (!student) {
      return res.status(400).json({
        success: false,
        message: 'Student not found or inactive'
      });
    }

    // Check if supervisor exists and is active
    const supervisor = await findOne('users', { id: caseData.supervisor_id, status: 'ACTIVE' });
    if (!supervisor) {
      return res.status(400).json({
        success: false,
        message: 'Supervisor not found or inactive'
      });
    }

    // Check if case already exists for this patient and student
    const existingCase = await findOne('cases', { 
      patient_id: caseData.patient_id, 
      student_id: caseData.student_id,
      status: ['ASSIGNED', 'PENDING_VERIFICATION']
    });
    
    if (existingCase) {
      return res.status(400).json({
        success: false,
        message: 'Active case already exists for this patient and student'
      });
    }

    // Create case
    const caseId = await insert('cases', caseData);

    await logAuditEvent(req.user.id, 'CREATE', 'CASE', caseId, null, caseData);

    // Return created case with details
    const createdCaseQuery = `
      SELECT 
        c.*,
        p.patient_code,
        CONCAT(p.first_name, ' ', p.last_name) as patient_name,
        student.name as student_name,
        supervisor.name as supervisor_name
      FROM cases c
      LEFT JOIN patients p ON c.patient_id = p.id
      LEFT JOIN users student ON c.student_id = student.id
      LEFT JOIN users supervisor ON c.supervisor_id = supervisor.id
      WHERE c.id = ?
    `;

    const createdCases = await query(createdCaseQuery, [caseId]);

    res.status(201).json({
      success: true,
      message: 'Case created successfully',
      data: createdCases[0]
    });
  } catch (error) {
    console.error('Create case error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
};

// Update case
const updateCase = async (req, res) => {
  try {
    const { id } = req.params;
    const updateData = req.body;

    // Check if case exists
    const existingCase = await findOne('cases', { id });
    if (!existingCase) {
      return res.status(404).json({
        success: false,
        message: 'Case not found'
      });
    }

    // If updating to PENDING_VERIFICATION, add verification timestamp
    if (updateData.status === 'PENDING_VERIFICATION' && existingCase.status !== 'PENDING_VERIFICATION') {
      updateData.submitted_for_verification_at = new Date();
    }

    // If updating to VERIFIED, set verifier info
    if (updateData.status === 'VERIFIED' && existingCase.status !== 'VERIFIED') {
      updateData.verified_by = req.user.id;
      updateData.verified_at = new Date();
    }

    // Update case
    await update('cases', updateData, { id });

    await logAuditEvent(req.user.id, 'UPDATE', 'CASE', id, existingCase, updateData);

    // Return updated case with details
    const updatedCaseQuery = `
      SELECT 
        c.*,
        p.patient_code,
        CONCAT(p.first_name, ' ', p.last_name) as patient_name,
        student.name as student_name,
        supervisor.name as supervisor_name,
        verifier.name as verifier_name
      FROM cases c
      LEFT JOIN patients p ON c.patient_id = p.id
      LEFT JOIN users student ON c.student_id = student.id
      LEFT JOIN users supervisor ON c.supervisor_id = supervisor.id
      LEFT JOIN users verifier ON c.verified_by = verifier.id
      WHERE c.id = ?
    `;

    const updatedCases = await query(updatedCaseQuery, [id]);

    res.json({
      success: true,
      message: 'Case updated successfully',
      data: updatedCases[0]
    });
  } catch (error) {
    console.error('Update case error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
};

// Delete case
const deleteCase = async (req, res) => {
  try {
    const { id } = req.params;

    // Check if case exists
    const existingCase = await findOne('cases', { id });
    if (!existingCase) {
      return res.status(404).json({
        success: false,
        message: 'Case not found'
      });
    }

    // Only allow deletion of assigned cases (not verified ones)
    if (existingCase.status === 'VERIFIED') {
      return res.status(400).json({
        success: false,
        message: 'Cannot delete verified cases'
      });
    }

    // Delete case
    await remove('cases', { id }, false);

    await logAuditEvent(req.user.id, 'DELETE', 'CASE', id, existingCase, null);

    res.json({
      success: true,
      message: 'Case deleted successfully'
    });
  } catch (error) {
    console.error('Delete case error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
};

// Get case statistics
const getCaseStats = async (req, res) => {
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
        COUNT(*) as total_cases,
        COUNT(CASE WHEN status = 'ASSIGNED' THEN 1 END) as assigned_cases,
        COUNT(CASE WHEN status = 'PENDING_VERIFICATION' THEN 1 END) as pending_cases,
        COUNT(CASE WHEN status = 'VERIFIED' THEN 1 END) as verified_cases,
        COUNT(CASE WHEN status = 'REJECTED' THEN 1 END) as rejected_cases,
        COUNT(DISTINCT student_id) as active_students
      FROM cases 
      WHERE created_at >= ${dateFilter}
    `;

    const stats = await query(statsQuery);

    // Student performance
    const studentStatsQuery = `
      SELECT 
        u.name as student_name,
        COUNT(*) as total_cases,
        COUNT(CASE WHEN c.status = 'VERIFIED' THEN 1 END) as verified_cases,
        ROUND(
          (COUNT(CASE WHEN c.status = 'VERIFIED' THEN 1 END) / 
          NULLIF(COUNT(*), 0)) * 100, 2
        ) as success_rate
      FROM cases c
      LEFT JOIN users u ON c.student_id = u.id
      WHERE c.created_at >= ${dateFilter}
      GROUP BY c.student_id, u.name
      ORDER BY verified_cases DESC
      LIMIT 10
    `;

    const studentStats = await query(studentStatsQuery);

    // Monthly case trends
    const monthlyTrendsQuery = `
      SELECT 
        DATE_FORMAT(created_at, '%Y-%m') as month,
        COUNT(*) as new_cases,
        COUNT(CASE WHEN status = 'VERIFIED' THEN 1 END) as verified_cases
      FROM cases 
      WHERE created_at >= DATE_SUB(NOW(), INTERVAL 12 MONTH)
      GROUP BY DATE_FORMAT(created_at, '%Y-%m')
      ORDER BY month ASC
    `;

    const monthlyTrends = await query(monthlyTrendsQuery);

    res.json({
      success: true,
      data: {
        overview: stats[0],
        student_performance: studentStats,
        monthly_trends: monthlyTrends
      }
    });
  } catch (error) {
    console.error('Get case stats error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
};

module.exports = {
  getCases,
  getStudentCases,
  getCaseById,
  createCase,
  updateCase,
  deleteCase,
  getCaseStats
};
