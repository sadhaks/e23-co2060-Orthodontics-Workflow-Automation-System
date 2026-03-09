const {
  findOne,
  insert,
  update,
  remove,
  query
} = require('../config/database');
const { logAuditEvent } = require('../middleware/errorHandler');

const PAYMENT_METHODS = ['CASH', 'CARD', 'BANK_TRANSFER', 'ONLINE', 'CHEQUE', 'OTHER'];
const PAYMENT_STATUSES = ['PENDING', 'PAID', 'PARTIAL', 'REFUNDED', 'VOID'];

const normalizePaymentData = (data = {}) => {
  const normalized = { ...data };

  ['reference_number', 'notes'].forEach((field) => {
    if (normalized[field] !== undefined && normalized[field] !== null && String(normalized[field]).trim() === '') {
      normalized[field] = null;
    }
  });

  if (normalized.currency !== undefined && normalized.currency !== null) {
    const currency = String(normalized.currency).trim().toUpperCase();
    normalized.currency = currency || 'LKR';
  }

  if (normalized.currency === undefined) {
    normalized.currency = 'LKR';
  }

  if (normalized.status === undefined || normalized.status === null || String(normalized.status).trim() === '') {
    normalized.status = 'PAID';
  }

  return normalized;
};

const getPatientPaymentRecords = async (req, res) => {
  try {
    const { patientId } = req.params;
    const { page = 1, limit = 25, deleted = 'active' } = req.query;
    const offset = (Number(page) - 1) * Number(limit);

    const patient = await findOne('patients', { id: patientId, deleted_at: null });
    if (!patient) {
      return res.status(404).json({
        success: false,
        message: 'Patient not found'
      });
    }

    const deletedMode = String(deleted || 'active').toLowerCase();
    if ((deletedMode === 'trashed' || deletedMode === 'all') && req.user.role !== 'ADMIN') {
      return res.status(403).json({
        success: false,
        message: 'Only admin can access payment recycle bin'
      });
    }

    let whereClause = 'WHERE pr.patient_id = ?';
    const queryParams = [patientId];

    if (deletedMode === 'trashed') {
      whereClause += ' AND pr.deleted_at IS NOT NULL';
    } else if (deletedMode !== 'all') {
      whereClause += ' AND pr.deleted_at IS NULL';
    }

    const countRows = await query(
      `SELECT COUNT(*) AS total
       FROM payment_records pr
       ${whereClause}`,
      queryParams
    );
    const total = Number(countRows[0]?.total || 0);

    const records = await query(
      `SELECT
         pr.*,
         creator.name AS created_by_name,
         creator.role AS created_by_role,
         updater.name AS updated_by_name,
         updater.role AS updated_by_role,
         deleter.name AS deleted_by_name
       FROM payment_records pr
       LEFT JOIN users creator ON pr.created_by = creator.id
       LEFT JOIN users updater ON pr.updated_by = updater.id
       LEFT JOIN users deleter ON pr.deleted_by = deleter.id
       ${whereClause}
       ORDER BY pr.payment_date DESC, pr.created_at DESC
       LIMIT ? OFFSET ?`,
      [...queryParams, Number(limit), offset]
    );

    return res.json({
      success: true,
      data: {
        records,
        pagination: {
          current_page: Number(page),
          total_pages: Math.ceil(total / Number(limit)),
          total_records: total,
          limit: Number(limit)
        }
      }
    });
  } catch (error) {
    console.error('Get patient payment records error:', error);
    return res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
};

const getPaymentRecordById = async (req, res) => {
  try {
    const { id } = req.params;

    const rows = await query(
      `SELECT
         pr.*,
         p.patient_code,
         CONCAT(p.first_name, ' ', p.last_name) AS patient_name,
         creator.name AS created_by_name,
         creator.role AS created_by_role,
         updater.name AS updated_by_name,
         updater.role AS updated_by_role,
         deleter.name AS deleted_by_name
       FROM payment_records pr
       LEFT JOIN patients p ON pr.patient_id = p.id
       LEFT JOIN users creator ON pr.created_by = creator.id
       LEFT JOIN users updater ON pr.updated_by = updater.id
       LEFT JOIN users deleter ON pr.deleted_by = deleter.id
       WHERE pr.id = ?
         AND pr.deleted_at IS NULL
       LIMIT 1`,
      [id]
    );

    if (!rows.length) {
      return res.status(404).json({
        success: false,
        message: 'Payment record not found'
      });
    }

    return res.json({
      success: true,
      data: rows[0]
    });
  } catch (error) {
    console.error('Get payment record error:', error);
    return res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
};

const createPaymentRecord = async (req, res) => {
  try {
    const { patientId } = req.params;
    const patient = await findOne('patients', { id: patientId, deleted_at: null });

    if (!patient) {
      return res.status(404).json({
        success: false,
        message: 'Patient not found'
      });
    }

    const payload = normalizePaymentData({
      ...req.body,
      patient_id: Number(patientId),
      created_by: req.user.id,
      updated_by: req.user.id
    });

    if (!PAYMENT_METHODS.includes(payload.payment_method)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid payment method'
      });
    }

    if (!PAYMENT_STATUSES.includes(payload.status)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid payment status'
      });
    }

    const paymentRecordId = await insert('payment_records', payload);

    await logAuditEvent(req.user.id, 'CREATE', 'PAYMENT_RECORD', paymentRecordId, null, {
      patient_id: Number(patientId),
      amount: payload.amount,
      payment_date: payload.payment_date,
      payment_method: payload.payment_method,
      status: payload.status
    });

    const createdRows = await query(
      `SELECT
         pr.*,
         creator.name AS created_by_name,
         creator.role AS created_by_role,
         updater.name AS updated_by_name,
         updater.role AS updated_by_role
       FROM payment_records pr
       LEFT JOIN users creator ON pr.created_by = creator.id
       LEFT JOIN users updater ON pr.updated_by = updater.id
       WHERE pr.id = ?
       LIMIT 1`,
      [paymentRecordId]
    );

    return res.status(201).json({
      success: true,
      message: 'Payment record created successfully',
      data: createdRows[0]
    });
  } catch (error) {
    console.error('Create payment record error:', error);
    return res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
};

const updatePaymentRecord = async (req, res) => {
  try {
    const { id } = req.params;
    const existingRecord = await findOne('payment_records', { id, deleted_at: null });

    if (!existingRecord) {
      return res.status(404).json({
        success: false,
        message: 'Payment record not found'
      });
    }

    const payload = normalizePaymentData({
      ...req.body,
      updated_by: req.user.id
    });

    if (payload.payment_method && !PAYMENT_METHODS.includes(payload.payment_method)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid payment method'
      });
    }

    if (payload.status && !PAYMENT_STATUSES.includes(payload.status)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid payment status'
      });
    }

    await update('payment_records', payload, { id });

    await logAuditEvent(req.user.id, 'UPDATE', 'PAYMENT_RECORD', Number(id), existingRecord, payload);

    const updatedRows = await query(
      `SELECT
         pr.*,
         creator.name AS created_by_name,
         creator.role AS created_by_role,
         updater.name AS updated_by_name,
         updater.role AS updated_by_role
       FROM payment_records pr
       LEFT JOIN users creator ON pr.created_by = creator.id
       LEFT JOIN users updater ON pr.updated_by = updater.id
       WHERE pr.id = ?
       LIMIT 1`,
      [id]
    );

    return res.json({
      success: true,
      message: 'Payment record updated successfully',
      data: updatedRows[0]
    });
  } catch (error) {
    console.error('Update payment record error:', error);
    return res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
};

const deletePaymentRecord = async (req, res) => {
  try {
    const { id } = req.params;
    const permanent = String(req.query.permanent || '').toLowerCase() === 'true';
    const rows = await query('SELECT * FROM payment_records WHERE id = ? LIMIT 1', [id]);
    const existingRecord = rows[0];

    if (!existingRecord) {
      return res.status(404).json({
        success: false,
        message: 'Payment record not found'
      });
    }

    if (permanent) {
      if (!existingRecord.deleted_at) {
        return res.status(400).json({
          success: false,
          message: 'Payment record must be moved to recycle bin before permanent deletion'
        });
      }

      await remove('payment_records', { id }, false);
      await logAuditEvent(req.user.id, 'HARD_DELETE', 'PAYMENT_RECORD', Number(id), existingRecord, null);

      return res.json({
        success: true,
        message: 'Payment record permanently deleted'
      });
    }

    if (existingRecord.deleted_at) {
      return res.status(400).json({
        success: false,
        message: 'Payment record already in recycle bin'
      });
    }

    const deletionUpdate = {
      deleted_at: new Date(),
      deleted_by: req.user.id
    };

    await update('payment_records', deletionUpdate, { id });
    await logAuditEvent(req.user.id, 'DELETE', 'PAYMENT_RECORD', Number(id), existingRecord, deletionUpdate);

    return res.json({
      success: true,
      message: 'Payment record moved to recycle bin'
    });
  } catch (error) {
    console.error('Delete payment record error:', error);
    return res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
};

const restorePaymentRecord = async (req, res) => {
  try {
    const { id } = req.params;
    const rows = await query('SELECT * FROM payment_records WHERE id = ? LIMIT 1', [id]);
    const existingRecord = rows[0];

    if (!existingRecord) {
      return res.status(404).json({
        success: false,
        message: 'Payment record not found'
      });
    }

    if (!existingRecord.deleted_at) {
      return res.status(400).json({
        success: false,
        message: 'Payment record is not in recycle bin'
      });
    }

    const restoreUpdate = {
      deleted_at: null,
      deleted_by: null
    };

    await update('payment_records', restoreUpdate, { id });
    await logAuditEvent(req.user.id, 'RESTORE', 'PAYMENT_RECORD', Number(id), existingRecord, restoreUpdate);

    return res.json({
      success: true,
      message: 'Payment record restored successfully'
    });
  } catch (error) {
    console.error('Restore payment record error:', error);
    return res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
};

module.exports = {
  getPatientPaymentRecords,
  getPaymentRecordById,
  createPaymentRecord,
  updatePaymentRecord,
  deletePaymentRecord,
  restorePaymentRecord
};
