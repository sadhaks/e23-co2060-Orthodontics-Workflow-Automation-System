const express = require('express');
const { authenticate, authorizeRoles } = require('../middleware/auth');
const { asyncHandler } = require('../middleware/errorHandler');
const reportController = require('../controllers/reportController');

const router = express.Router();

// Apply authentication to all routes
router.use(authenticate);

// Apply admin authorization to all report routes
router.use(authorizeRoles('ADMIN'));

// GET /api/reports/patient-status - Get patient status report
router.get('/patient-status', 
  asyncHandler(reportController.getPatientStatusReport)
);

// GET /api/reports/visit-summary - Get visit summary report
router.get('/visit-summary', 
  asyncHandler(reportController.getVisitSummaryReport)
);

// GET /api/reports/inventory-alerts - Get inventory alerts report
router.get('/inventory-alerts', 
  asyncHandler(reportController.getInventoryAlertsReport)
);

// GET /api/reports/dashboard - Get comprehensive dashboard report
router.get('/dashboard', 
  asyncHandler(reportController.getDashboardReport)
);

// GET /api/reports/audit-logs - Get system audit logs (admin only)
router.get('/audit-logs',
  asyncHandler(reportController.getAuditLogsReport)
);

// Audit logs are read-only, even for admin
router.all('/audit-logs', (req, res) => {
  return res.status(405).json({
    success: false,
    message: 'Method not allowed. Audit logs are read-only.'
  });
});

module.exports = router;
