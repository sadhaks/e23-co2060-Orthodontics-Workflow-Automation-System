const express = require('express');
const rateLimit = require('express-rate-limit');
const { validate, schemas } = require('../middleware/validation');
const { authenticate } = require('../middleware/auth');
const { asyncHandler } = require('../middleware/errorHandler');
const authController = require('../controllers/authController');

const router = express.Router();

// Rate limiting for auth routes
const authLimiter = rateLimit({
  windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 15 * 60 * 1000, // 15 minutes
  max: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS) || 5, // limit each IP to 5 requests per windowMs
  message: {
    success: false,
    message: 'Too many authentication attempts. Please try again later.'
  },
  standardHeaders: true,
  legacyHeaders: false,
});

// Apply rate limiting to login route
router.use('/login', authLimiter);
router.use('/google', authLimiter);

// POST /api/auth/login - User login
router.post('/login', 
  validate(schemas.login),
  asyncHandler(authController.login)
);

// POST /api/auth/google - Google ID token login
router.post('/google',
  validate(schemas.googleLogin),
  asyncHandler(authController.googleLogin)
);

// POST /api/auth/refresh - Refresh access token
router.post('/refresh', 
  validate(schemas.refreshToken),
  asyncHandler(authController.refreshToken)
);

// POST /api/auth/logout - User logout
router.post('/logout', 
  authenticate,
  asyncHandler(authController.logout)
);

// GET /api/auth/profile - Get current user profile
router.get('/profile', 
  authenticate,
  asyncHandler(authController.getProfile)
);

// PUT /api/auth/profile - Update user profile
router.put('/profile', 
  authenticate,
  validate(schemas.updateUser),
  asyncHandler(authController.updateProfile)
);

// PUT /api/auth/change-password - Change password
router.put('/change-password', 
  authenticate,
  validate(schemas.changePassword),
  asyncHandler(authController.changePassword)
);

module.exports = router;
