const express = require('express');
const { validate, schemas } = require('../middleware/validation');
const { authenticate } = require('../middleware/auth');
const { asyncHandler } = require('../middleware/errorHandler');
const visitController = require('../controllers/visitController');
const { requirePermission, OBJECT_TYPES, PERMISSIONS } = require('../middleware/accessControl');
const { query } = require('../config/database');

const router = express.Router();

// Apply authentication to all routes
router.use(authenticate);

const resolvePatientIdFromVisitId = async (req) => {
  const rows = await query('SELECT patient_id FROM visits WHERE id = ? LIMIT 1', [req.params.id]);
  return rows[0]?.patient_id || null;
};

// GET /api/visits/today - Get today's visits
router.get('/today', 
  requirePermission(OBJECT_TYPES.PATIENT_APPOINTMENTS, PERMISSIONS.READ),
  asyncHandler(visitController.getTodayVisits)
);

// GET /api/visits/stats - Get visit statistics
router.get('/stats', 
  requirePermission(OBJECT_TYPES.PATIENT_APPOINTMENTS, PERMISSIONS.READ),
  asyncHandler(visitController.getVisitStats)
);

// GET /api/visits/:id - Get single visit by ID
router.get('/:id', 
  requirePermission(OBJECT_TYPES.PATIENT_APPOINTMENTS, PERMISSIONS.READ, { resolvePatientId: resolvePatientIdFromVisitId }),
  asyncHandler(visitController.getVisitById)
);

// PUT /api/visits/:id - Update visit
router.put('/:id', 
  requirePermission(OBJECT_TYPES.PATIENT_APPOINTMENTS, PERMISSIONS.UPDATE, { resolvePatientId: resolvePatientIdFromVisitId }),
  validate(schemas.updateVisit),
  asyncHandler(visitController.updateVisit)
);

// POST /api/visits/:id/send-reminder - Send appointment reminder email
router.post('/:id/send-reminder',
  requirePermission(OBJECT_TYPES.PATIENT_APPOINTMENTS, PERMISSIONS.UPDATE, { resolvePatientId: resolvePatientIdFromVisitId }),
  asyncHandler(visitController.sendVisitReminder)
);

// DELETE /api/visits/:id - Delete visit
router.delete('/:id', 
  requirePermission(OBJECT_TYPES.PATIENT_APPOINTMENTS, PERMISSIONS.DELETE, { resolvePatientId: resolvePatientIdFromVisitId }),
  asyncHandler(visitController.deleteVisit)
);

// GET /api/patients/:patientId/visits - Get visits for a patient
router.get('/patients/:patientId', 
  requirePermission(OBJECT_TYPES.PATIENT_APPOINTMENTS, PERMISSIONS.READ),
  validate(schemas.pagination, 'query'),
  asyncHandler(visitController.getPatientVisits)
);

// POST /api/patients/:patientId/visits - Create new visit for patient
router.post('/patients/:patientId', 
  requirePermission(OBJECT_TYPES.PATIENT_APPOINTMENTS, PERMISSIONS.CREATE),
  validate(schemas.createVisit),
  asyncHandler(visitController.createVisit)
);

module.exports = router;
