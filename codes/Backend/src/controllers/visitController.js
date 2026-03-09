const { 
  findOne, 
  insert, 
  update, 
  remove,
  query
} = require('../config/database');
const { logAuditEvent } = require('../middleware/errorHandler');
const { sendManualReminder } = require('../services/reminderService');

const normalizeVisitDateForDb = (value) => {
  if (typeof value !== 'string') return null;
  const raw = value.trim();
  if (!raw) return null;

  // Accept HTML datetime-local (YYYY-MM-DDTHH:mm or :ss) and DB style (space separated).
  const normalized = raw.includes('T') ? raw.replace('T', ' ') : raw;
  if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/.test(normalized)) {
    return `${normalized}:00`;
  }
  if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(normalized)) {
    return normalized;
  }
  return null;
};

// Get visits for a patient
const getPatientVisits = async (req, res) => {
  try {
    const { patientId } = req.params;
    const { page = 1, limit = 10, status } = req.query;
    const offset = (page - 1) * limit;

    // Check if patient exists
    const patient = await findOne('patients', { id: patientId, deleted_at: null });
    if (!patient) {
      return res.status(404).json({
        success: false,
        message: 'Patient not found'
      });
    }

    // Build query conditions
    let whereClause = 'WHERE v.patient_id = ?';
    let queryParams = [patientId];

    if (status) {
      whereClause += ' AND v.status = ?';
      queryParams.push(status);
    }

    // Get total count
    const countQuery = `
      SELECT COUNT(*) as total 
      FROM visits v 
      ${whereClause}
    `;
    const totalResult = await query(countQuery, queryParams);
    const total = totalResult[0].total;

    // Get visits with provider details
    const visitsQuery = `
      SELECT 
        v.*,
        u.name as provider_name,
        u.role as provider_role
      FROM visits v
      LEFT JOIN users u ON v.provider_id = u.id
      ${whereClause}
      ORDER BY v.visit_date DESC
      LIMIT ? OFFSET ?
    `;
    queryParams.push(parseInt(limit), offset);

    const visits = await query(visitsQuery, queryParams);

    res.json({
      success: true,
      data: {
        visits,
        pagination: {
          current_page: parseInt(page),
          total_pages: Math.ceil(total / limit),
          total_records: total,
          limit: parseInt(limit)
        }
      }
    });
  } catch (error) {
    console.error('Get patient visits error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
};

// Get single visit by ID
const getVisitById = async (req, res) => {
  try {
    const { id } = req.params;

    const visitQuery = `
      SELECT 
        v.*,
        p.patient_code,
        CONCAT(p.first_name, ' ', p.last_name) as patient_name,
        u.name as provider_name,
        u.role as provider_role
      FROM visits v
      LEFT JOIN patients p ON v.patient_id = p.id
      LEFT JOIN users u ON v.provider_id = u.id
      WHERE v.id = ?
    `;

    const visits = await query(visitQuery, [id]);

    if (visits.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Visit not found'
      });
    }

    res.json({
      success: true,
      data: visits[0]
    });
  } catch (error) {
    console.error('Get visit error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
};

// Create new visit
const createVisit = async (req, res) => {
  try {
    if (req.user.role !== 'RECEPTION') {
      return res.status(403).json({
        success: false,
        message: 'Only receptionist can schedule appointments'
      });
    }

    const { patientId } = req.params;
    const visitData = { ...req.body, patient_id: patientId };

    // Check if patient exists
    const patient = await findOne('patients', { id: patientId, deleted_at: null });
    if (!patient) {
      return res.status(404).json({
        success: false,
        message: 'Patient not found'
      });
    }

    if (!visitData.provider_id) {
      visitData.provider_id = req.user.id;
    }

    const normalizedVisitDate = normalizeVisitDateForDb(visitData.visit_date);
    if (!normalizedVisitDate) {
      return res.status(400).json({
        success: false,
        message: 'visit_date must be a valid date-time'
      });
    }
    visitData.visit_date = normalizedVisitDate;

    // Check if provider exists and is active
    const provider = await findOne('users', { id: visitData.provider_id, status: 'ACTIVE' });
    if (!provider) {
      return res.status(400).json({
        success: false,
        message: 'Provider not found or inactive'
      });
    }

    // Create visit
    const visitId = await insert('visits', visitData);

    await logAuditEvent(req.user.id, 'CREATE', 'VISIT', visitId, null, visitData);

    // Return created visit with details
    const createdVisitQuery = `
      SELECT 
        v.*,
        p.patient_code,
        CONCAT(p.first_name, ' ', p.last_name) as patient_name,
        u.name as provider_name,
        u.role as provider_role
      FROM visits v
      LEFT JOIN patients p ON v.patient_id = p.id
      LEFT JOIN users u ON v.provider_id = u.id
      WHERE v.id = ?
    `;

    const createdVisits = await query(createdVisitQuery, [visitId]);

    res.status(201).json({
      success: true,
      message: 'Visit created successfully',
      data: createdVisits[0]
    });
  } catch (error) {
    console.error('Create visit error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
};

// Update visit
const updateVisit = async (req, res) => {
  try {
    if (req.user.role !== 'RECEPTION') {
      return res.status(403).json({
        success: false,
        message: 'Only receptionist can update appointment attendance'
      });
    }

    const { id } = req.params;
    const updateData = req.body;

    // Check if visit exists
    const existingVisit = await findOne('visits', { id });
    if (!existingVisit) {
      return res.status(404).json({
        success: false,
        message: 'Visit not found'
      });
    }

    const allowedFields = new Set(['status', 'notes']);
    const requestedFields = Object.keys(updateData);
    const hasDisallowedField = requestedFields.some((field) => !allowedFields.has(field));
    if (hasDisallowedField) {
      return res.status(400).json({
        success: false,
        message: 'Receptionist can only update status/notes for visits'
      });
    }

    const allowedStatuses = new Set(['COMPLETED', 'DID_NOT_ATTEND']);
    if (!updateData.status || !allowedStatuses.has(updateData.status)) {
      return res.status(400).json({
        success: false,
        message: 'Status must be COMPLETED or DID_NOT_ATTEND'
      });
    }

    if (existingVisit.status !== 'SCHEDULED') {
      return res.status(400).json({
        success: false,
        message: 'Only scheduled visits can be marked for attendance'
      });
    }

    // Update visit
    await update('visits', updateData, { id });

    await logAuditEvent(req.user.id, 'UPDATE', 'VISIT', id, existingVisit, updateData);

    // Return updated visit with details
    const updatedVisitQuery = `
      SELECT 
        v.*,
        p.patient_code,
        CONCAT(p.first_name, ' ', p.last_name) as patient_name,
        u.name as provider_name,
        u.role as provider_role
      FROM visits v
      LEFT JOIN patients p ON v.patient_id = p.id
      LEFT JOIN users u ON v.provider_id = u.id
      WHERE v.id = ?
    `;

    const updatedVisits = await query(updatedVisitQuery, [id]);

    res.json({
      success: true,
      message: 'Visit updated successfully',
      data: updatedVisits[0]
    });
  } catch (error) {
    console.error('Update visit error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
};

// Delete visit
const deleteVisit = async (req, res) => {
  try {
    const { id } = req.params;

    // Check if visit exists
    const existingVisit = await findOne('visits', { id });
    if (!existingVisit) {
      return res.status(404).json({
        success: false,
        message: 'Visit not found'
      });
    }

    // Only allow deletion of scheduled visits (not completed ones)
    if (existingVisit.status === 'COMPLETED') {
      return res.status(400).json({
        success: false,
        message: 'Cannot delete completed visits'
      });
    }

    // Delete visit
    await remove('visits', { id }, false);

    await logAuditEvent(req.user.id, 'DELETE', 'VISIT', id, existingVisit, null);

    res.json({
      success: true,
      message: 'Visit deleted successfully'
    });
  } catch (error) {
    console.error('Delete visit error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
};

// Get today's visits
const getTodayVisits = async (req, res) => {
  try {
    const { status } = req.query;

    let whereClause = 'WHERE DATE(v.visit_date) = CURDATE()';
    let queryParams = [];

    if (status) {
      whereClause += ' AND v.status = ?';
      queryParams.push(status);
    }

    const visitsQuery = `
      SELECT 
        v.*,
        p.patient_code,
        CONCAT(p.first_name, ' ', p.last_name) as patient_name,
        u.name as provider_name,
        u.role as provider_role
      FROM visits v
      LEFT JOIN patients p ON v.patient_id = p.id
      LEFT JOIN users u ON v.provider_id = u.id
      ${whereClause}
      ORDER BY v.visit_date ASC
    `;

    const visits = await query(visitsQuery, queryParams);

    res.json({
      success: true,
      data: visits
    });
  } catch (error) {
    console.error('Get today visits error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
};

// Get visit statistics
const getVisitStats = async (req, res) => {
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
        COUNT(*) as total_visits,
        COUNT(CASE WHEN status = 'COMPLETED' THEN 1 END) as completed_visits,
        COUNT(CASE WHEN status = 'SCHEDULED' THEN 1 END) as scheduled_visits,
        COUNT(CASE WHEN status = 'CANCELLED' THEN 1 END) as cancelled_visits,
        COUNT(CASE WHEN status = 'DID_NOT_ATTEND' THEN 1 END) as did_not_attend_visits,
        COUNT(CASE WHEN visit_date >= NOW() THEN 1 END) as upcoming_visits
      FROM visits 
      WHERE visit_date >= ${dateFilter}
    `;

    const stats = await query(statsQuery);

    // Daily visit counts for the period
    const dailyStatsQuery = `
      SELECT 
        DATE(visit_date) as date,
        COUNT(*) as visit_count,
        COUNT(CASE WHEN status = 'COMPLETED' THEN 1 END) as completed_count
      FROM visits 
      WHERE visit_date >= ${dateFilter}
      GROUP BY DATE(visit_date)
      ORDER BY date ASC
    `;

    const dailyStats = await query(dailyStatsQuery);

    // Procedure type statistics
    const procedureStatsQuery = `
      SELECT 
        procedure_type,
        COUNT(*) as count
      FROM visits 
      WHERE visit_date >= ${dateFilter}
        AND procedure_type IS NOT NULL
        AND procedure_type != ''
      GROUP BY procedure_type
      ORDER BY count DESC
      LIMIT 10
    `;

    const procedureStats = await query(procedureStatsQuery);

    res.json({
      success: true,
      data: {
        overview: stats[0],
        daily_visits: dailyStats,
        top_procedures: procedureStats
      }
    });
  } catch (error) {
    console.error('Get visit stats error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
};

const sendVisitReminder = async (req, res) => {
  try {
    if (req.user.role !== 'RECEPTION') {
      return res.status(403).json({
        success: false,
        message: 'Only receptionist can send appointment reminders'
      });
    }

    const { id } = req.params;
    const outcome = await sendManualReminder({ visitId: id, initiatedBy: req.user.id });
    if (!outcome.ok) {
      return res.status(outcome.status).json({
        success: false,
        message: outcome.message
      });
    }

    res.json({
      success: true,
      message: outcome.already_sent
        ? 'Appointment reminder was already sent earlier'
        : (outcome.simulated ? 'Appointment reminder simulated' : 'Appointment reminder sent successfully'),
      data: {
        visit_id: outcome.visit.id,
        patient_email: outcome.visit.patient_email,
        queued: false,
        delivery: outcome.already_sent
          ? 'already_sent'
          : (outcome.simulated ? 'simulated' : 'sent'),
        simulated: !!outcome.simulated,
        already_sent: !!outcome.already_sent,
        message_id: outcome.messageId || null
      }
    });
  } catch (error) {
    console.error('Send visit reminder error:', error);
    res.status(500).json({
      success: false,
      message: error?.message || 'Failed to send reminder'
    });
  }
};

module.exports = {
  getPatientVisits,
  getVisitById,
  createVisit,
  updateVisit,
  deleteVisit,
  getTodayVisits,
  getVisitStats,
  sendVisitReminder
};
