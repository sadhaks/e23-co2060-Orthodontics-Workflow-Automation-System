const express = require('express');
const { validate, schemas } = require('../middleware/validation');
const { authenticate } = require('../middleware/auth');
const { asyncHandler } = require('../middleware/errorHandler');
const queueController = require('../controllers/queueController');
const { requirePermission, OBJECT_TYPES, PERMISSIONS } = require('../middleware/accessControl');
const { query } = require('../config/database');

const router = express.Router();

// Apply authentication to all routes
router.use(authenticate);

const resolvePatientIdFromQueueId = async (req) => {
  const rows = await query('SELECT patient_id FROM queue WHERE id = ? LIMIT 1', [req.params.id]);
  return rows[0]?.patient_id || null;
};

// GET /api/queue - Get current queue
router.get('/', 
  requirePermission(OBJECT_TYPES.PATIENT_APPOINTMENTS, PERMISSIONS.READ),
  asyncHandler(queueController.getQueue)
);

// GET /api/queue/stats - Get queue statistics
router.get('/stats', 
  requirePermission(OBJECT_TYPES.PATIENT_APPOINTMENTS, PERMISSIONS.READ),
  asyncHandler(queueController.getQueueStats)
);

// POST /api/queue - Add patient to queue
router.post('/', 
  requirePermission(OBJECT_TYPES.PATIENT_APPOINTMENTS, PERMISSIONS.CREATE),
  validate(schemas.createQueue),
  asyncHandler(queueController.addToQueue)
);

// PUT /api/queue/:id/status - Update queue status
router.put('/:id/status', 
  requirePermission(OBJECT_TYPES.PATIENT_APPOINTMENTS, PERMISSIONS.UPDATE, { resolvePatientId: resolvePatientIdFromQueueId }),
  validate(schemas.updateQueueStatus),
  asyncHandler(queueController.updateQueueStatus)
);

// DELETE /api/queue/:id - Remove from queue
router.delete('/:id', 
  requirePermission(OBJECT_TYPES.PATIENT_APPOINTMENTS, PERMISSIONS.DELETE, { resolvePatientId: resolvePatientIdFromQueueId }),
  asyncHandler(queueController.removeFromQueue)
);

module.exports = router;
