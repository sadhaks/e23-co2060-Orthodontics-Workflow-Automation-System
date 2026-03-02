const { 
  findOne, 
  insert, 
  update, 
  remove,
  query,
  transaction
} = require('../config/database');
const { logAuditEvent } = require('../middleware/errorHandler');

// Get all inventory items
const getInventory = async (req, res) => {
  try {
    const { 
      page = 1, 
      limit = 10, 
      category, 
      search,
      alert_level,
      deleted = 'active',
      sort = 'name',
      order = 'ASC'
    } = req.query;
    const offset = (page - 1) * limit;
    const deletedMode = ['active', 'trashed', 'all'].includes(String(deleted).toLowerCase())
      ? String(deleted).toLowerCase()
      : 'active';

    let whereClause = 'WHERE i.purged_at IS NULL';
    let queryParams = [];

    if (deletedMode === 'trashed') {
      whereClause += ' AND i.deleted_at IS NOT NULL';
    } else if (deletedMode === 'active') {
      whereClause += ' AND i.deleted_at IS NULL';
    }

    if (category) {
      whereClause += ' AND i.category = ?';
      queryParams.push(category);
    }

    if (search) {
      whereClause += ' AND (i.name LIKE ? OR i.category LIKE ?)';
      const searchTerm = `%${search}%`;
      queryParams.push(searchTerm, searchTerm);
    }

    if (alert_level) {
      if (alert_level === 'LOW_STOCK') {
        whereClause += ' AND i.quantity <= i.minimum_threshold AND i.quantity > 0';
      } else if (alert_level === 'OUT_OF_STOCK') {
        whereClause += ' AND i.quantity = 0';
      } else if (alert_level === 'NORMAL') {
        whereClause += ' AND i.quantity > i.minimum_threshold';
      }
    }

    // Get total count
    const countQuery = `
      SELECT COUNT(*) as total 
      FROM inventory_items i
      ${whereClause}
    `;
    const totalResult = await query(countQuery, queryParams);
    const total = totalResult[0].total;

    // Get inventory items
    const inventoryQuery = `
      SELECT 
        i.*,
        CASE 
          WHEN i.quantity = 0 THEN 'OUT_OF_STOCK'
          WHEN i.quantity <= i.minimum_threshold THEN 'LOW_STOCK'
          ELSE 'NORMAL'
        END as alert_level
      FROM inventory_items i
      ${whereClause}
      ORDER BY ${sort} ${order}
      LIMIT ? OFFSET ?
    `;
    queryParams.push(parseInt(limit), offset);

    const inventory = await query(inventoryQuery, queryParams);

    res.json({
      success: true,
      data: {
        inventory,
        pagination: {
          current_page: parseInt(page),
          total_pages: Math.ceil(total / limit),
          total_records: total,
          limit: parseInt(limit)
        }
      }
    });
  } catch (error) {
    console.error('Get inventory error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
};

// Get single inventory item by ID
const getInventoryItemById = async (req, res) => {
  try {
    const { id } = req.params;
    const deletedMode = ['active', 'trashed', 'all'].includes(String(req.query.deleted || 'active').toLowerCase())
      ? String(req.query.deleted || 'active').toLowerCase()
      : 'active';
    const deletedFilter = deletedMode === 'all'
      ? ' AND i.purged_at IS NULL'
      : deletedMode === 'trashed'
        ? ' AND i.deleted_at IS NOT NULL AND i.purged_at IS NULL'
        : ' AND i.deleted_at IS NULL AND i.purged_at IS NULL';

    const itemQuery = `
      SELECT 
        i.*,
        CASE 
          WHEN i.quantity = 0 THEN 'OUT_OF_STOCK'
          WHEN i.quantity <= i.minimum_threshold THEN 'LOW_STOCK'
          ELSE 'NORMAL'
        END as alert_level
      FROM inventory_items i
      WHERE i.id = ?${deletedFilter}
    `;

    const items = await query(itemQuery, [id]);

    if (items.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Inventory item not found'
      });
    }

    // Get recent transactions for this item
    const transactionsQuery = `
      SELECT 
        it.*,
        u.name as performed_by_name
      FROM inventory_transactions it
      LEFT JOIN users u ON it.performed_by = u.id
      WHERE it.item_id = ?
      ORDER BY it.created_at DESC
      LIMIT 10
    `;

    const transactions = await query(transactionsQuery, [id]);

    res.json({
      success: true,
      data: {
        item: items[0],
        recent_transactions: transactions
      }
    });
  } catch (error) {
    console.error('Get inventory item error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
};

// Create new inventory item
const createInventoryItem = async (req, res) => {
  try {
    const itemData = req.body;

    // Check if item with same name already exists
    const existingItem = await findOne('inventory_items', { name: itemData.name, deleted_at: null, purged_at: null });
    if (existingItem) {
      return res.status(400).json({
        success: false,
        message: 'Item with this name already exists'
      });
    }

    // Create item
    const itemId = await insert('inventory_items', itemData);

    // Log initial stock as transaction if quantity > 0
    if (itemData.quantity > 0) {
      await insert('inventory_transactions', {
        item_id: itemId,
        transaction_type: 'IN',
        quantity: itemData.quantity,
        reference_type: 'PURCHASE',
        performed_by: req.user.id,
        notes: 'Initial stock entry'
      });
    }

    await logAuditEvent(req.user.id, 'CREATE', 'INVENTORY_ITEM', itemId, null, itemData);

    // Return created item
    const createdItem = await findOne('inventory_items', { id: itemId });

    res.status(201).json({
      success: true,
      message: 'Inventory item created successfully',
      data: createdItem
    });
  } catch (error) {
    console.error('Create inventory item error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
};

// Update inventory item
const updateInventoryItem = async (req, res) => {
  try {
    const { id } = req.params;
    const updateData = req.body;

    // Check if item exists
    const existingItem = await findOne('inventory_items', { id, deleted_at: null, purged_at: null });
    if (!existingItem) {
      return res.status(404).json({
        success: false,
        message: 'Inventory item not found'
      });
    }

    // If updating name, check for duplicates
    if (updateData.name && updateData.name !== existingItem.name) {
      const duplicateItem = await findOne('inventory_items', { name: updateData.name, deleted_at: null, purged_at: null });
      if (duplicateItem) {
        return res.status(400).json({
          success: false,
          message: 'Item with this name already exists'
        });
      }
    }

    // Update item
    await update('inventory_items', updateData, { id });

    await logAuditEvent(req.user.id, 'UPDATE', 'INVENTORY_ITEM', id, existingItem, updateData);

    // Return updated item
    const updatedItem = await findOne('inventory_items', { id: id, deleted_at: null, purged_at: null });

    res.json({
      success: true,
      message: 'Inventory item updated successfully',
      data: updatedItem
    });
  } catch (error) {
    console.error('Update inventory item error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
};

// Delete inventory item
const deleteInventoryItem = async (req, res) => {
  try {
    const { id } = req.params;
    const permanent = String(req.query.permanent || '').toLowerCase() === 'true';

    // Check if item exists (include items already in bin)
    const existingItem = await findOne('inventory_items', { id });
    if (!existingItem) {
      return res.status(404).json({
        success: false,
        message: 'Inventory item not found'
      });
    }

    if (permanent) {
      if (!existingItem.deleted_at) {
        return res.status(400).json({
          success: false,
          message: 'Inventory item must be moved to bin before permanent deletion'
        });
      }

      // Do not allow hard delete when history exists and FK constraints would fail
      const transactionCount = await query('SELECT COUNT(*) as count FROM inventory_transactions WHERE item_id = ?', [id]);
      if (Number(transactionCount[0]?.count || 0) > 0) {
        await update('inventory_items', {
          purged_at: new Date(),
          purged_by: req.user.id
        }, { id });
      } else {
        await remove('inventory_items', { id }, false);
      }
      await logAuditEvent(req.user.id, 'PERMANENT_DELETE', 'INVENTORY_ITEM', id, existingItem, null);

      return res.json({
        success: true,
        message: 'Inventory item permanently deleted'
      });
    }

    if (existingItem.purged_at) {
      return res.status(404).json({
        success: false,
        message: 'Inventory item not found'
      });
    }

    if (existingItem.deleted_at) {
      return res.status(400).json({
        success: false,
        message: 'Inventory item already in bin'
      });
    }

    await update('inventory_items', { deleted_at: new Date(), deleted_by: req.user.id }, { id });
    await logAuditEvent(req.user.id, 'DELETE', 'INVENTORY_ITEM', id, existingItem, {
      deleted_at: new Date(),
      deleted_by: req.user.id
    });

    return res.json({
      success: true,
      message: 'Inventory item moved to bin'
    });
  } catch (error) {
    console.error('Delete inventory item error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
};

// Restore inventory item from bin
const restoreInventoryItem = async (req, res) => {
  try {
    const { id } = req.params;

    const existingItem = await findOne('inventory_items', { id });
    if (!existingItem) {
      return res.status(404).json({
        success: false,
        message: 'Inventory item not found'
      });
    }

    if (!existingItem.deleted_at) {
      return res.status(400).json({
        success: false,
        message: 'Inventory item is not in bin'
      });
    }

    if (existingItem.purged_at) {
      return res.status(400).json({
        success: false,
        message: 'Inventory item is permanently deleted and cannot be restored'
      });
    }

    const activeDuplicate = await findOne('inventory_items', { name: existingItem.name, deleted_at: null, purged_at: null });
    if (activeDuplicate && Number(activeDuplicate.id) !== Number(id)) {
      return res.status(400).json({
        success: false,
        message: 'An active item with this name already exists'
      });
    }

    await update('inventory_items', { deleted_at: null, deleted_by: null }, { id });
    await logAuditEvent(req.user.id, 'RESTORE', 'INVENTORY_ITEM', id, existingItem, { deleted_at: null, deleted_by: null });

    return res.json({
      success: true,
      message: 'Inventory item restored successfully'
    });
  } catch (error) {
    console.error('Restore inventory item error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
};

// Update stock quantity
const updateStock = async (req, res) => {
  try {
    const { id } = req.params;
    const { transaction_type, quantity, reference_type, notes } = req.body;

    // Validate input
    if (!transaction_type || !quantity || !reference_type) {
      return res.status(400).json({
        success: false,
        message: 'Transaction type, quantity, and reference type are required'
      });
    }

    if (!['IN', 'OUT', 'ADJUSTMENT'].includes(transaction_type)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid transaction type'
      });
    }

    if (quantity <= 0) {
      return res.status(400).json({
        success: false,
        message: 'Quantity must be greater than 0'
      });
    }

    // Get current item
    const item = await findOne('inventory_items', { id, deleted_at: null, purged_at: null });
    if (!item) {
      return res.status(404).json({
        success: false,
        message: 'Inventory item not found'
      });
    }

    // Calculate new quantity
    let newQuantity;
    if (transaction_type === 'IN') {
      newQuantity = item.quantity + quantity;
    } else if (transaction_type === 'OUT') {
      newQuantity = item.quantity - quantity;
      if (newQuantity < 0) {
        return res.status(400).json({
          success: false,
          message: 'Insufficient stock for this transaction'
        });
      }
    } else { // ADJUSTMENT
      newQuantity = quantity;
    }

    // Use transaction for atomic update
    await transaction(async (connection) => {
      // Update item quantity
      await connection.execute(
        'UPDATE inventory_items SET quantity = ?, last_updated = NOW() WHERE id = ?',
        [newQuantity, id]
      );

      // Record transaction
      await connection.execute(
        'INSERT INTO inventory_transactions (item_id, transaction_type, quantity, reference_type, performed_by, notes) VALUES (?, ?, ?, ?, ?, ?)',
        [id, transaction_type, quantity, reference_type, req.user.id, notes || null]
      );
    });

    await logAuditEvent(req.user.id, 'STOCK_UPDATE', 'INVENTORY_ITEM', id, 
      { old_quantity: item.quantity }, 
      { new_quantity: newQuantity, transaction_type, quantity }
    );

    // Return updated item
    const updatedItem = await findOne('inventory_items', { id, deleted_at: null, purged_at: null });

    res.json({
      success: true,
      message: 'Stock updated successfully',
      data: updatedItem
    });
  } catch (error) {
    console.error('Update stock error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
};

// Get inventory transactions
const getInventoryTransactions = async (req, res) => {
  try {
    const { 
      page = 1, 
      limit = 10, 
      item_id,
      transaction_type,
      start_date,
      end_date
    } = req.query;
    const offset = (page - 1) * limit;

    let whereClause = 'WHERE 1=1';
    let queryParams = [];

    if (item_id) {
      whereClause += ' AND it.item_id = ?';
      queryParams.push(item_id);
    }

    if (transaction_type) {
      whereClause += ' AND it.transaction_type = ?';
      queryParams.push(transaction_type);
    }

    if (start_date) {
      whereClause += ' AND DATE(it.created_at) >= ?';
      queryParams.push(start_date);
    }

    if (end_date) {
      whereClause += ' AND DATE(it.created_at) <= ?';
      queryParams.push(end_date);
    }

    // Get total count
    const countQuery = `
      SELECT COUNT(*) as total 
      FROM inventory_transactions it
      ${whereClause}
    `;
    const totalResult = await query(countQuery, queryParams);
    const total = totalResult[0].total;

    // Get transactions
    const transactionsQuery = `
      SELECT 
        it.*,
        ii.name as item_name,
        ii.category as item_category,
        u.name as performed_by_name
      FROM inventory_transactions it
      LEFT JOIN inventory_items ii ON it.item_id = ii.id
      LEFT JOIN users u ON it.performed_by = u.id
      ${whereClause}
      ORDER BY it.created_at DESC
      LIMIT ? OFFSET ?
    `;
    queryParams.push(parseInt(limit), offset);

    const transactions = await query(transactionsQuery, queryParams);

    res.json({
      success: true,
      data: {
        transactions,
        pagination: {
          current_page: parseInt(page),
          total_pages: Math.ceil(total / limit),
          total_records: total,
          limit: parseInt(limit)
        }
      }
    });
  } catch (error) {
    console.error('Get inventory transactions error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
};

// Get inventory statistics
const getInventoryStats = async (req, res) => {
  try {
    const statsQuery = `
      SELECT 
        COUNT(*) as total_items,
        COUNT(CASE WHEN quantity = 0 THEN 1 END) as out_of_stock,
        COUNT(CASE WHEN quantity <= minimum_threshold AND quantity > 0 THEN 1 END) as low_stock,
        COUNT(CASE WHEN quantity > minimum_threshold THEN 1 END) as normal_stock,
        SUM(quantity) as total_quantity,
        SUM(CASE WHEN quantity <= minimum_threshold THEN quantity ELSE 0 END) as critical_quantity
      FROM inventory_items
      WHERE deleted_at IS NULL
        AND purged_at IS NULL
    `;

    const stats = await query(statsQuery);

    // Category breakdown
    const categoryStatsQuery = `
      SELECT 
        category,
        COUNT(*) as item_count,
        SUM(quantity) as total_quantity,
        COUNT(CASE WHEN quantity <= minimum_threshold THEN 1 END) as low_stock_count
      FROM inventory_items
      WHERE deleted_at IS NULL
        AND purged_at IS NULL
      GROUP BY category
      ORDER BY item_count DESC
    `;

    const categoryStats = await query(categoryStatsQuery);

    // Recent transactions
    const recentTransactionsQuery = `
      SELECT 
        it.*,
        ii.name as item_name,
        u.name as performed_by_name
      FROM inventory_transactions it
      LEFT JOIN inventory_items ii ON it.item_id = ii.id
      LEFT JOIN users u ON it.performed_by = u.id
      ORDER BY it.created_at DESC
      LIMIT 10
    `;

    const recentTransactions = await query(recentTransactionsQuery);

    // Low stock alerts
    const alertsQuery = `
      SELECT 
        id,
        name,
        category,
        quantity,
        minimum_threshold,
        unit
      FROM inventory_items
      WHERE deleted_at IS NULL
        AND purged_at IS NULL
        AND quantity <= minimum_threshold
      ORDER BY quantity ASC
      LIMIT 20
    `;

    const alerts = await query(alertsQuery);

    res.json({
      success: true,
      data: {
        overview: stats[0],
        category_breakdown: categoryStats,
        recent_transactions: recentTransactions,
        low_stock_alerts: alerts
      }
    });
  } catch (error) {
    console.error('Get inventory stats error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
};

module.exports = {
  getInventory,
  getInventoryItemById,
  createInventoryItem,
  updateInventoryItem,
  deleteInventoryItem,
  restoreInventoryItem,
  updateStock,
  getInventoryTransactions,
  getInventoryStats
};
