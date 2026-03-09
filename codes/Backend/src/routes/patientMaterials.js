const express = require('express');
const { authenticate } = require('../middleware/auth');
const { validate, schemas } = require('../middleware/validation');
const { asyncHandler } = require('../middleware/errorHandler');
const { requirePermission, OBJECT_TYPES, PERMISSIONS } = require('../middleware/accessControl');
const patientMaterialUsageController = require('../controllers/patientMaterialUsageController');
const { query } = require('../config/database');

const router = express.Router();

router.use(authenticate);

const resolvePatientIdFromUsageId = async (req) => {
  const rows = await query('SELECT patient_id FROM patient_material_usages WHERE id = ? LIMIT 1', [req.params.id]);
  return rows[0]?.patient_id || null;
};

router.get(
  '/:id',
  requirePermission(OBJECT_TYPES.PATIENT_MATERIALS, PERMISSIONS.READ, { resolvePatientId: resolvePatientIdFromUsageId }),
  asyncHandler(patientMaterialUsageController.getPatientMaterialUsageById)
);

router.put(
  '/:id',
  requirePermission(OBJECT_TYPES.PATIENT_MATERIALS, PERMISSIONS.UPDATE, { resolvePatientId: resolvePatientIdFromUsageId }),
  validate(schemas.updatePatientMaterialUsage),
  asyncHandler(patientMaterialUsageController.updatePatientMaterialUsage)
);

router.delete(
  '/:id',
  requirePermission(OBJECT_TYPES.PATIENT_MATERIALS, PERMISSIONS.DELETE, { resolvePatientId: resolvePatientIdFromUsageId }),
  asyncHandler(patientMaterialUsageController.deletePatientMaterialUsage)
);

router.put(
  '/:id/restore',
  requirePermission(OBJECT_TYPES.PATIENT_MATERIALS, PERMISSIONS.DELETE, { resolvePatientId: resolvePatientIdFromUsageId }),
  asyncHandler(patientMaterialUsageController.restorePatientMaterialUsage)
);

router.get(
  '/patients/:patientId',
  requirePermission(OBJECT_TYPES.PATIENT_MATERIALS, PERMISSIONS.READ),
  validate(schemas.pagination, 'query'),
  asyncHandler(patientMaterialUsageController.getPatientMaterialUsages)
);

router.post(
  '/patients/:patientId',
  requirePermission(OBJECT_TYPES.PATIENT_MATERIALS, PERMISSIONS.CREATE),
  validate(schemas.createPatientMaterialUsage),
  asyncHandler(patientMaterialUsageController.createPatientMaterialUsage)
);

module.exports = router;
