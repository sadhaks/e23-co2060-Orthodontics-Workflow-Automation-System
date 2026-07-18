const express = require('express');
const { validate, schemas } = require('../middleware/validation');
const { authenticate, authorizeRoles } = require('../middleware/auth');
const { asyncHandler } = require('../middleware/errorHandler');
const queueController = require('../controllers/queueController');

const router = express.Router();

// Apply authentication to all routes
router.use(authenticate);

const queueRoles = ['ADMIN', 'NURSE', 'RECEPTION', 'ORTHODONTIST', 'DENTAL_SURGEON', 'STUDENT'];
const queueMutationRoles = ['RECEPTION', 'ORTHODONTIST', 'DENTAL_SURGEON', 'STUDENT'];

// GET /api/queue - Get current queue
router.get('/',
  authorizeRoles(...queueRoles),
  asyncHandler(queueController.getQueue)
);

// GET /api/queue/stats - Get queue statistics
router.get('/stats',
  authorizeRoles(...queueRoles),
  asyncHandler(queueController.getQueueStats)
);

// POST /api/queue - Add patient to queue
router.post('/',
  authorizeRoles('RECEPTION'),
  validate(schemas.createQueue),
  asyncHandler(queueController.addToQueue)
);

// PUT /api/queue/:id/status - Update queue status
router.put('/:id/status',
  authorizeRoles(...queueMutationRoles),
  validate(schemas.updateQueueStatus),
  asyncHandler(queueController.updateQueueStatus)
);

// DELETE /api/queue/:id - Remove from queue
router.delete('/:id',
  authorizeRoles('RECEPTION'),
  asyncHandler(queueController.removeFromQueue)
);

module.exports = router;
