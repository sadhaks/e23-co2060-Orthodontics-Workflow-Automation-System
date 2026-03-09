const express = require('express');
const { validate, schemas } = require('../middleware/validation');
const { authenticate } = require('../middleware/auth');
const { asyncHandler } = require('../middleware/errorHandler');
const clinicalNoteController = require('../controllers/clinicalNoteController');
const { requirePermission, OBJECT_TYPES, PERMISSIONS } = require('../middleware/accessControl');
const { query } = require('../config/database');

const router = express.Router();

// Apply authentication to all routes
router.use(authenticate);

const resolvePatientIdFromNoteId = async (req) => {
  const rows = await query('SELECT patient_id FROM clinical_notes WHERE id = ? LIMIT 1', [req.params.id]);
  return rows[0]?.patient_id || null;
};

// GET /api/clinical-notes/stats - Get clinical note statistics
router.get('/stats', 
  requirePermission(OBJECT_TYPES.PATIENT_NOTES, PERMISSIONS.READ),
  asyncHandler(clinicalNoteController.getNoteStats)
);

// GET /api/clinical-notes/pending - Get notes pending verification
router.get('/pending', 
  requirePermission(OBJECT_TYPES.PATIENT_NOTES, PERMISSIONS.READ),
  validate(schemas.pagination, 'query'),
  asyncHandler(clinicalNoteController.getPendingVerification)
);

// GET /api/clinical-notes/:id - Get single clinical note by ID
router.get('/:id', 
  requirePermission(OBJECT_TYPES.PATIENT_NOTES, PERMISSIONS.READ, { resolvePatientId: resolvePatientIdFromNoteId }),
  asyncHandler(clinicalNoteController.getNoteById)
);

// PUT /api/clinical-notes/:id - Update clinical note
router.put('/:id', 
  requirePermission(OBJECT_TYPES.PATIENT_NOTES, PERMISSIONS.UPDATE, { resolvePatientId: resolvePatientIdFromNoteId }),
  validate(schemas.updateClinicalNote),
  asyncHandler(clinicalNoteController.updateClinicalNote)
);

// DELETE /api/clinical-notes/:id - Delete clinical note
router.delete('/:id', 
  requirePermission(OBJECT_TYPES.PATIENT_NOTES, PERMISSIONS.DELETE, { resolvePatientId: resolvePatientIdFromNoteId }),
  asyncHandler(clinicalNoteController.deleteClinicalNote)
);

// PUT /api/clinical-notes/:id/restore - Restore clinical note from bin
router.put('/:id/restore',
  requirePermission(OBJECT_TYPES.PATIENT_NOTES, PERMISSIONS.DELETE, { resolvePatientId: resolvePatientIdFromNoteId }),
  asyncHandler(clinicalNoteController.restoreClinicalNote)
);

// POST /api/clinical-notes/:id/verify - Verify clinical note
router.post('/:id/verify', 
  requirePermission(OBJECT_TYPES.PATIENT_NOTES, PERMISSIONS.APPROVE, { resolvePatientId: resolvePatientIdFromNoteId }),
  asyncHandler(clinicalNoteController.verifyNote)
);

// GET /api/patients/:patientId/clinical-notes - Get clinical notes for a patient
router.get('/patients/:patientId', 
  requirePermission(OBJECT_TYPES.PATIENT_NOTES, PERMISSIONS.READ),
  validate(schemas.pagination, 'query'),
  asyncHandler(clinicalNoteController.getPatientNotes)
);

// POST /api/patients/:patientId/clinical-notes - Create clinical note for patient
router.post('/patients/:patientId', 
  requirePermission(OBJECT_TYPES.PATIENT_NOTES, PERMISSIONS.CREATE),
  validate(schemas.createClinicalNote),
  asyncHandler(clinicalNoteController.createClinicalNote)
);

module.exports = router;
