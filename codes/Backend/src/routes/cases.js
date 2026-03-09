const express = require('express');
const { validate, schemas } = require('../middleware/validation');
const { authenticate } = require('../middleware/auth');
const { asyncHandler } = require('../middleware/errorHandler');
const caseController = require('../controllers/caseController');
const { requirePermission, OBJECT_TYPES, PERMISSIONS } = require('../middleware/accessControl');
const { query } = require('../config/database');

const router = express.Router();

// Apply authentication to all routes
router.use(authenticate);

const resolvePatientIdFromCaseId = async (req) => {
  const rows = await query('SELECT patient_id FROM cases WHERE id = ? LIMIT 1', [req.params.id]);
  return rows[0]?.patient_id || null;
};

// GET /api/cases - Get all cases with filtering
router.get('/', 
  requirePermission(OBJECT_TYPES.PATIENT_TREATMENT, PERMISSIONS.READ),
  validate(schemas.pagination, 'query'),
  asyncHandler(caseController.getCases)
);

// GET /api/cases/stats - Get case statistics
router.get('/stats', 
  requirePermission(OBJECT_TYPES.PATIENT_TREATMENT, PERMISSIONS.READ),
  asyncHandler(caseController.getCaseStats)
);

// GET /api/cases/:id - Get single case by ID
router.get('/:id', 
  requirePermission(OBJECT_TYPES.PATIENT_TREATMENT, PERMISSIONS.READ, { resolvePatientId: resolvePatientIdFromCaseId }),
  asyncHandler(caseController.getCaseById)
);

// POST /api/cases - Create new case
router.post('/', 
  requirePermission(OBJECT_TYPES.PATIENT_TREATMENT, PERMISSIONS.CREATE),
  validate(schemas.createCase),
  asyncHandler(caseController.createCase)
);

// PUT /api/cases/:id - Update case
router.put('/:id', 
  requirePermission(OBJECT_TYPES.PATIENT_TREATMENT, PERMISSIONS.UPDATE, { resolvePatientId: resolvePatientIdFromCaseId }),
  validate(schemas.updateCase),
  asyncHandler(caseController.updateCase)
);

// DELETE /api/cases/:id - Delete case
router.delete('/:id', 
  requirePermission(OBJECT_TYPES.PATIENT_TREATMENT, PERMISSIONS.DELETE, { resolvePatientId: resolvePatientIdFromCaseId }),
  asyncHandler(caseController.deleteCase)
);

// GET /api/students/:studentId/cases - Get cases for a specific student
router.get('/students/:studentId', 
  requirePermission(OBJECT_TYPES.PATIENT_TREATMENT, PERMISSIONS.READ),
  validate(schemas.pagination, 'query'),
  asyncHandler(caseController.getStudentCases)
);

module.exports = router;
