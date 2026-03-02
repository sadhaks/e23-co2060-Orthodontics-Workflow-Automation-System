const express = require('express');
const { validate, schemas } = require('../middleware/validation');
const { authenticate } = require('../middleware/auth');
const { asyncHandler } = require('../middleware/errorHandler');
const userController = require('../controllers/userController');
const { requirePermission, OBJECT_TYPES, PERMISSIONS } = require('../middleware/accessControl');

const router = express.Router();

// Apply authentication to all routes
router.use(authenticate);

// GET /api/users - Get all users (Admin only)
router.get('/', 
  requirePermission(OBJECT_TYPES.USER_ACCOUNTS, PERMISSIONS.READ),
  validate(schemas.pagination, 'query'),
  asyncHandler(userController.getUsers)
);

// GET /api/users/stats - Get user statistics
router.get('/stats', 
  requirePermission(OBJECT_TYPES.USER_ACCOUNTS, PERMISSIONS.READ),
  asyncHandler(userController.getUserStats)
);

// GET /api/users/staff - Get staff directory
router.get('/staff', 
  requirePermission(OBJECT_TYPES.USER_ACCOUNTS, PERMISSIONS.READ),
  asyncHandler(userController.getStaffDirectory)
);

// GET /api/users/:id - Get single user by ID
router.get('/:id', 
  requirePermission(OBJECT_TYPES.USER_ACCOUNTS, PERMISSIONS.READ),
  asyncHandler(userController.getUserById)
);

// POST /api/users - Create new user (Admin only)
router.post('/', 
  requirePermission(OBJECT_TYPES.USER_ACCOUNTS, PERMISSIONS.CREATE),
  validate(schemas.createUser),
  asyncHandler(userController.createUser)
);

// PUT /api/users/:id - Update user (Admin only)
router.put('/:id', 
  requirePermission(OBJECT_TYPES.USER_ACCOUNTS, PERMISSIONS.UPDATE),
  validate(schemas.updateUser),
  asyncHandler(userController.updateUser)
);

// POST /api/users/:id/reset-password - Admin-generated reset password sent by email
router.post('/:id/reset-password',
  requirePermission(OBJECT_TYPES.USER_ACCOUNTS, PERMISSIONS.UPDATE),
  asyncHandler(userController.resetUserPassword)
);

// DELETE /api/users/:id - Delete user (Admin only)
router.delete('/:id', 
  requirePermission(OBJECT_TYPES.USER_ACCOUNTS, PERMISSIONS.DELETE),
  asyncHandler(userController.deleteUser)
);

module.exports = router;
