const express = require('express');
const { authenticate } = require('../middleware/auth');
const { validate, schemas } = require('../middleware/validation');
const { asyncHandler } = require('../middleware/errorHandler');
const { requirePermission, OBJECT_TYPES, PERMISSIONS } = require('../middleware/accessControl');
const paymentRecordController = require('../controllers/paymentRecordController');
const { query } = require('../config/database');

const router = express.Router();

router.use(authenticate);

const resolvePatientIdFromRecordId = async (req) => {
  const rows = await query('SELECT patient_id FROM payment_records WHERE id = ? LIMIT 1', [req.params.id]);
  return rows[0]?.patient_id || null;
};

router.get(
  '/:id',
  requirePermission(OBJECT_TYPES.PATIENT_PAYMENTS, PERMISSIONS.READ, { resolvePatientId: resolvePatientIdFromRecordId }),
  asyncHandler(paymentRecordController.getPaymentRecordById)
);

router.put(
  '/:id',
  requirePermission(OBJECT_TYPES.PATIENT_PAYMENTS, PERMISSIONS.UPDATE, { resolvePatientId: resolvePatientIdFromRecordId }),
  validate(schemas.updatePaymentRecord),
  asyncHandler(paymentRecordController.updatePaymentRecord)
);

router.delete(
  '/:id',
  requirePermission(OBJECT_TYPES.PATIENT_PAYMENTS, PERMISSIONS.DELETE, { resolvePatientId: resolvePatientIdFromRecordId }),
  asyncHandler(paymentRecordController.deletePaymentRecord)
);

router.put(
  '/:id/restore',
  requirePermission(OBJECT_TYPES.PATIENT_PAYMENTS, PERMISSIONS.DELETE, { resolvePatientId: resolvePatientIdFromRecordId }),
  asyncHandler(paymentRecordController.restorePaymentRecord)
);

router.get(
  '/patients/:patientId',
  requirePermission(OBJECT_TYPES.PATIENT_PAYMENTS, PERMISSIONS.READ),
  validate(schemas.pagination, 'query'),
  asyncHandler(paymentRecordController.getPatientPaymentRecords)
);

router.post(
  '/patients/:patientId',
  requirePermission(OBJECT_TYPES.PATIENT_PAYMENTS, PERMISSIONS.CREATE),
  validate(schemas.createPaymentRecord),
  asyncHandler(paymentRecordController.createPaymentRecord)
);

module.exports = router;
