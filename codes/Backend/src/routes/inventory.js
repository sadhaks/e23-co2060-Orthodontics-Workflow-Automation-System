const express = require('express');
const { validate, schemas } = require('../middleware/validation');
const { authenticate, authorizeRoles } = require('../middleware/auth');
const { asyncHandler } = require('../middleware/errorHandler');
const inventoryController = require('../controllers/inventoryController');

const router = express.Router();

// Apply authentication to all routes
router.use(authenticate);

// GET /api/inventory - Get all inventory items
router.get('/', 
  validate(schemas.pagination, 'query'),
  asyncHandler(inventoryController.getInventory)
);

// GET /api/inventory/stats - Get inventory statistics
router.get('/stats', 
  asyncHandler(inventoryController.getInventoryStats)
);

// GET /api/inventory/transactions - Get inventory transactions
router.get('/transactions', 
  validate(schemas.pagination, 'query'),
  asyncHandler(inventoryController.getInventoryTransactions)
);

// GET /api/inventory/:id - Get single inventory item by ID
router.get('/:id', 
  asyncHandler(inventoryController.getInventoryItemById)
);

// POST /api/inventory - Create new inventory item
router.post('/', 
  authorizeRoles('NURSE'),
  validate(schemas.createInventoryItem),
  asyncHandler(inventoryController.createInventoryItem)
);

// PUT /api/inventory/:id - Update inventory item
router.put('/:id', 
  authorizeRoles('NURSE'),
  validate(schemas.updateInventoryItem),
  asyncHandler(inventoryController.updateInventoryItem)
);

// DELETE /api/inventory/:id - Delete inventory item
router.delete('/:id', 
  authorizeRoles('NURSE'),
  asyncHandler(inventoryController.deleteInventoryItem)
);

// PUT /api/inventory/:id/restore - Restore inventory item from bin
router.put('/:id/restore',
  authorizeRoles('NURSE'),
  asyncHandler(inventoryController.restoreInventoryItem)
);

// PUT /api/inventory/:id/stock - Update stock quantity
router.put('/:id/stock', 
  authorizeRoles('NURSE'),
  asyncHandler(inventoryController.updateStock)
);

module.exports = router;
