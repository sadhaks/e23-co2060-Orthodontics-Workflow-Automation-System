const {
  findOne,
  update,
  remove,
  query,
  transaction
} = require('../config/database');
const { logAuditEvent } = require('../middleware/errorHandler');

const DELETE_CAPABLE_ROLES = new Set(['ADMIN', 'NURSE']);

const createHttpError = (message, statusCode = 400) => {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
};

const normalizeUsageData = (data = {}, options = {}) => {
  const normalized = { ...data };

  ['purpose', 'notes'].forEach((field) => {
    if (normalized[field] !== undefined && normalized[field] !== null && String(normalized[field]).trim() === '') {
      normalized[field] = null;
    }
  });

  if (normalized.inventory_item_id !== undefined) {
    normalized.inventory_item_id = Number(normalized.inventory_item_id);
  }

  if (normalized.quantity !== undefined) {
    normalized.quantity = Number(normalized.quantity);
  }

  if (options.defaultUsedAt && !normalized.used_at) {
    normalized.used_at = new Date().toISOString().slice(0, 19).replace('T', ' ');
  }

  return normalized;
};

const buildUsageTransactionNote = (patientId, materialName, action, notes, usageId) => {
  const parts = [
    `Patient #${patientId}`,
    materialName || 'Material',
    action,
    usageId ? `usage:${usageId}` : null,
    notes ? String(notes).trim() : null
  ].filter(Boolean);
  return parts.join(' | ');
};

const getPatientMaterialUsages = async (req, res) => {
  try {
    const { patientId } = req.params;
    const { page = 1, limit = 25, deleted = 'active' } = req.query;
    const offset = (Number(page) - 1) * Number(limit);

    const patient = await findOne('patients', { id: patientId, deleted_at: null });
    if (!patient) {
      return res.status(404).json({
        success: false,
        message: 'Patient not found'
      });
    }

    const deletedMode = String(deleted || 'active').toLowerCase();
    if ((deletedMode === 'trashed' || deletedMode === 'all') && !DELETE_CAPABLE_ROLES.has(req.user.role)) {
      return res.status(403).json({
        success: false,
        message: 'Only admin or nurse can access the material recycle bin'
      });
    }

    let whereClause = 'WHERE pmu.patient_id = ?';
    const queryParams = [patientId];

    if (deletedMode === 'trashed') {
      whereClause += ' AND pmu.deleted_at IS NOT NULL';
    } else if (deletedMode !== 'all') {
      whereClause += ' AND pmu.deleted_at IS NULL';
    }

    const countRows = await query(
      `SELECT COUNT(*) AS total
       FROM patient_material_usages pmu
       ${whereClause}`,
      queryParams
    );
    const total = Number(countRows[0]?.total || 0);

    const records = await query(
      `SELECT
         pmu.*,
         ii.name AS material_name,
         ii.category AS material_category,
         ii.unit AS material_unit,
         creator.name AS author_name,
         creator.role AS created_by_role,
         updater.name AS updated_by_name,
         updater.role AS updated_by_role,
         deleter.name AS deleted_by_name
       FROM patient_material_usages pmu
       INNER JOIN inventory_items ii ON pmu.inventory_item_id = ii.id
       LEFT JOIN users creator ON pmu.created_by = creator.id
       LEFT JOIN users updater ON pmu.updated_by = updater.id
       LEFT JOIN users deleter ON pmu.deleted_by = deleter.id
       ${whereClause}
       ORDER BY pmu.used_at DESC, pmu.created_at DESC
       LIMIT ? OFFSET ?`,
      [...queryParams, Number(limit), offset]
    );

    return res.json({
      success: true,
      data: {
        records,
        pagination: {
          current_page: Number(page),
          total_pages: Math.ceil(total / Number(limit)),
          total_records: total,
          limit: Number(limit)
        }
      }
    });
  } catch (error) {
    console.error('Get patient material usages error:', error);
    return res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
};

const getPatientMaterialUsageById = async (req, res) => {
  try {
    const { id } = req.params;

    const rows = await query(
      `SELECT
         pmu.*,
         ii.name AS material_name,
         ii.category AS material_category,
         ii.unit AS material_unit,
         creator.name AS author_name,
         creator.role AS created_by_role,
         updater.name AS updated_by_name,
         updater.role AS updated_by_role,
         deleter.name AS deleted_by_name
       FROM patient_material_usages pmu
       INNER JOIN inventory_items ii ON pmu.inventory_item_id = ii.id
       LEFT JOIN users creator ON pmu.created_by = creator.id
       LEFT JOIN users updater ON pmu.updated_by = updater.id
       LEFT JOIN users deleter ON pmu.deleted_by = deleter.id
       WHERE pmu.id = ?
       LIMIT 1`,
      [id]
    );

    if (!rows.length) {
      return res.status(404).json({
        success: false,
        message: 'Patient material usage not found'
      });
    }

    return res.json({
      success: true,
      data: rows[0]
    });
  } catch (error) {
    console.error('Get patient material usage by id error:', error);
    return res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
};

const createPatientMaterialUsage = async (req, res) => {
  try {
    const { patientId } = req.params;
    const patient = await findOne('patients', { id: patientId, deleted_at: null });

    if (!patient) {
      return res.status(404).json({
        success: false,
        message: 'Patient not found'
      });
    }

    const payload = normalizeUsageData({
      ...req.body,
      patient_id: Number(patientId),
      created_by: req.user.id,
      updated_by: req.user.id
    }, { defaultUsedAt: true });

    const createdUsageId = await transaction(async (connection) => {
      const [itemRows] = await connection.execute(
        `SELECT id, name, quantity, deleted_at, purged_at
         FROM inventory_items
         WHERE id = ?
         LIMIT 1
         FOR UPDATE`,
        [payload.inventory_item_id]
      );

      const item = itemRows[0];
      if (!item || item.deleted_at || item.purged_at) {
        throw createHttpError('Selected material is not available in inventory');
      }

      if (Number(item.quantity) < payload.quantity) {
        throw createHttpError(`Insufficient stock for ${item.name}`);
      }

      const [usageResult] = await connection.execute(
        `INSERT INTO patient_material_usages
          (patient_id, inventory_item_id, quantity, used_at, purpose, notes, created_by, updated_by)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          payload.patient_id,
          payload.inventory_item_id,
          payload.quantity,
          payload.used_at,
          payload.purpose || null,
          payload.notes || null,
          payload.created_by,
          payload.updated_by
        ]
      );

      const usageId = Number(usageResult.insertId);

      await connection.execute(
        'UPDATE inventory_items SET quantity = quantity - ?, last_updated = NOW() WHERE id = ?',
        [payload.quantity, payload.inventory_item_id]
      );

      await connection.execute(
        `INSERT INTO inventory_transactions
          (item_id, transaction_type, quantity, reference_type, reference_id, performed_by, notes)
         VALUES (?, 'OUT', ?, 'USAGE', ?, ?, ?)`,
        [
          payload.inventory_item_id,
          payload.quantity,
          usageId,
          req.user.id,
          buildUsageTransactionNote(patientId, item.name, 'create', payload.notes, usageId)
        ]
      );

      return usageId;
    });

    await logAuditEvent(req.user.id, 'CREATE', 'PATIENT_MATERIAL_USAGE', createdUsageId, null, {
      patient_id: Number(patientId),
      inventory_item_id: payload.inventory_item_id,
      quantity: payload.quantity,
      used_at: payload.used_at
    });

    const createdRows = await query(
      `SELECT
         pmu.*,
         ii.name AS material_name,
         ii.category AS material_category,
         ii.unit AS material_unit,
         creator.name AS author_name,
         creator.role AS created_by_role,
         updater.name AS updated_by_name,
         updater.role AS updated_by_role
       FROM patient_material_usages pmu
       INNER JOIN inventory_items ii ON pmu.inventory_item_id = ii.id
       LEFT JOIN users creator ON pmu.created_by = creator.id
       LEFT JOIN users updater ON pmu.updated_by = updater.id
       WHERE pmu.id = ?
       LIMIT 1`,
      [createdUsageId]
    );

    return res.status(201).json({
      success: true,
      message: 'Patient material usage recorded successfully',
      data: createdRows[0]
    });
  } catch (error) {
    console.error('Create patient material usage error:', error);
    return res.status(error?.statusCode || 500).json({
      success: false,
      message: error?.message || 'Internal server error'
    });
  }
};

const updatePatientMaterialUsage = async (req, res) => {
  try {
    const { id } = req.params;
    const updates = normalizeUsageData(req.body);

    const existingUsage = await findOne('patient_material_usages', { id, deleted_at: null });
    if (!existingUsage) {
      return res.status(404).json({
        success: false,
        message: 'Patient material usage not found'
      });
    }

    const nextInventoryItemId = updates.inventory_item_id || Number(existingUsage.inventory_item_id);
    const nextQuantity = updates.quantity || Number(existingUsage.quantity);

    await transaction(async (connection) => {
      const [usageRows] = await connection.execute(
        `SELECT *
         FROM patient_material_usages
         WHERE id = ? AND deleted_at IS NULL
         LIMIT 1
         FOR UPDATE`,
        [id]
      );
      const usageRow = usageRows[0];
      if (!usageRow) {
        throw createHttpError('Patient material usage not found', 404);
      }

      const sameItem = Number(usageRow.inventory_item_id) === Number(nextInventoryItemId);

      const [oldItemRows] = await connection.execute(
        `SELECT id, name, quantity, deleted_at, purged_at
         FROM inventory_items
         WHERE id = ?
         LIMIT 1
         FOR UPDATE`,
        [usageRow.inventory_item_id]
      );
      const oldItem = oldItemRows[0];
      if (!oldItem || oldItem.deleted_at || oldItem.purged_at) {
        throw createHttpError('Current material is not available in inventory');
      }

      let newItem = oldItem;
      if (!sameItem) {
        const [newItemRows] = await connection.execute(
          `SELECT id, name, quantity, deleted_at, purged_at
           FROM inventory_items
           WHERE id = ?
           LIMIT 1
           FOR UPDATE`,
          [nextInventoryItemId]
        );
        newItem = newItemRows[0];
        if (!newItem || newItem.deleted_at || newItem.purged_at) {
          throw createHttpError('Selected material is not available in inventory');
        }
      }

      if (sameItem) {
        const delta = Number(nextQuantity) - Number(usageRow.quantity);
        if (delta > 0) {
          if (Number(oldItem.quantity) < delta) {
            throw createHttpError(`Insufficient stock for ${oldItem.name}`);
          }
          await connection.execute('UPDATE inventory_items SET quantity = quantity - ?, last_updated = NOW() WHERE id = ?', [delta, oldItem.id]);
          await connection.execute(
            `INSERT INTO inventory_transactions
              (item_id, transaction_type, quantity, reference_type, reference_id, performed_by, notes)
             VALUES (?, 'OUT', ?, 'USAGE', ?, ?, ?)`,
            [oldItem.id, delta, id, req.user.id, buildUsageTransactionNote(usageRow.patient_id, oldItem.name, 'update-out', updates.notes, Number(id))]
          );
        } else if (delta < 0) {
          await connection.execute('UPDATE inventory_items SET quantity = quantity + ?, last_updated = NOW() WHERE id = ?', [Math.abs(delta), oldItem.id]);
          await connection.execute(
            `INSERT INTO inventory_transactions
              (item_id, transaction_type, quantity, reference_type, reference_id, performed_by, notes)
             VALUES (?, 'IN', ?, 'USAGE', ?, ?, ?)`,
            [oldItem.id, Math.abs(delta), id, req.user.id, buildUsageTransactionNote(usageRow.patient_id, oldItem.name, 'update-in', updates.notes, Number(id))]
          );
        }
      } else {
        await connection.execute('UPDATE inventory_items SET quantity = quantity + ?, last_updated = NOW() WHERE id = ?', [usageRow.quantity, oldItem.id]);
        await connection.execute(
          `INSERT INTO inventory_transactions
            (item_id, transaction_type, quantity, reference_type, reference_id, performed_by, notes)
           VALUES (?, 'IN', ?, 'USAGE', ?, ?, ?)`,
          [oldItem.id, usageRow.quantity, id, req.user.id, buildUsageTransactionNote(usageRow.patient_id, oldItem.name, 'change-item-return', updates.notes, Number(id))]
        );

        if (Number(newItem.quantity) < Number(nextQuantity)) {
          throw createHttpError(`Insufficient stock for ${newItem.name}`);
        }

        await connection.execute('UPDATE inventory_items SET quantity = quantity - ?, last_updated = NOW() WHERE id = ?', [nextQuantity, newItem.id]);
        await connection.execute(
          `INSERT INTO inventory_transactions
            (item_id, transaction_type, quantity, reference_type, reference_id, performed_by, notes)
           VALUES (?, 'OUT', ?, 'USAGE', ?, ?, ?)`,
          [newItem.id, nextQuantity, id, req.user.id, buildUsageTransactionNote(usageRow.patient_id, newItem.name, 'change-item-use', updates.notes, Number(id))]
        );
      }

      await connection.execute(
        `UPDATE patient_material_usages
         SET inventory_item_id = ?,
             quantity = ?,
             used_at = ?,
             purpose = ?,
             notes = ?,
             updated_by = ?,
             updated_at = NOW()
         WHERE id = ?`,
        [
          nextInventoryItemId,
          nextQuantity,
          updates.used_at || usageRow.used_at,
          updates.purpose !== undefined ? updates.purpose : usageRow.purpose,
          updates.notes !== undefined ? updates.notes : usageRow.notes,
          req.user.id,
          id
        ]
      );
    });

    await logAuditEvent(req.user.id, 'UPDATE', 'PATIENT_MATERIAL_USAGE', Number(id), existingUsage, updates);

    const updatedRows = await query(
      `SELECT
         pmu.*,
         ii.name AS material_name,
         ii.category AS material_category,
         ii.unit AS material_unit,
         creator.name AS author_name,
         creator.role AS created_by_role,
         updater.name AS updated_by_name,
         updater.role AS updated_by_role
       FROM patient_material_usages pmu
       INNER JOIN inventory_items ii ON pmu.inventory_item_id = ii.id
       LEFT JOIN users creator ON pmu.created_by = creator.id
       LEFT JOIN users updater ON pmu.updated_by = updater.id
       WHERE pmu.id = ?
       LIMIT 1`,
      [id]
    );

    return res.json({
      success: true,
      message: 'Patient material usage updated successfully',
      data: updatedRows[0]
    });
  } catch (error) {
    console.error('Update patient material usage error:', error);
    return res.status(error?.statusCode || 500).json({
      success: false,
      message: error?.message || 'Internal server error'
    });
  }
};

const deletePatientMaterialUsage = async (req, res) => {
  try {
    const { id } = req.params;
    const permanent = String(req.query.permanent || '').toLowerCase() === 'true';

    const existingRows = await query('SELECT * FROM patient_material_usages WHERE id = ? LIMIT 1', [id]);
    const existingUsage = existingRows[0];
    if (!existingUsage) {
      return res.status(404).json({
        success: false,
        message: 'Patient material usage not found'
      });
    }

    if (permanent) {
      if (!existingUsage.deleted_at) {
        return res.status(400).json({
          success: false,
          message: 'Move the usage record to the recycle bin before permanently deleting it'
        });
      }

      await remove('patient_material_usages', { id }, false);
      await logAuditEvent(req.user.id, 'PURGE', 'PATIENT_MATERIAL_USAGE', Number(id), existingUsage, null);

      return res.json({
        success: true,
        message: 'Patient material usage permanently deleted'
      });
    }

    if (existingUsage.deleted_at) {
      return res.status(400).json({
        success: false,
        message: 'Patient material usage is already in the recycle bin'
      });
    }

    await transaction(async (connection) => {
      const [usageRows] = await connection.execute(
        `SELECT *
         FROM patient_material_usages
         WHERE id = ? AND deleted_at IS NULL
         LIMIT 1
         FOR UPDATE`,
        [id]
      );
      const usageRow = usageRows[0];
      if (!usageRow) {
        throw createHttpError('Patient material usage not found', 404);
      }

      const [itemRows] = await connection.execute(
        `SELECT id, name
         FROM inventory_items
         WHERE id = ?
         LIMIT 1
         FOR UPDATE`,
        [usageRow.inventory_item_id]
      );
      const item = itemRows[0];
      if (!item) {
        throw createHttpError('Linked inventory item not found', 404);
      }

      await connection.execute('UPDATE inventory_items SET quantity = quantity + ?, last_updated = NOW() WHERE id = ?', [usageRow.quantity, usageRow.inventory_item_id]);
      await connection.execute(
        `INSERT INTO inventory_transactions
          (item_id, transaction_type, quantity, reference_type, reference_id, performed_by, notes)
         VALUES (?, 'IN', ?, 'USAGE', ?, ?, ?)`,
        [usageRow.inventory_item_id, usageRow.quantity, id, req.user.id, buildUsageTransactionNote(usageRow.patient_id, item.name, 'delete-restore-stock', usageRow.notes, Number(id))]
      );

      await connection.execute(
        'UPDATE patient_material_usages SET deleted_at = NOW(), deleted_by = ? WHERE id = ?',
        [req.user.id, id]
      );
    });

    await logAuditEvent(req.user.id, 'DELETE', 'PATIENT_MATERIAL_USAGE', Number(id), existingUsage, {
      deleted_at: new Date().toISOString()
    });

    return res.json({
      success: true,
      message: 'Patient material usage moved to recycle bin'
    });
  } catch (error) {
    console.error('Delete patient material usage error:', error);
    return res.status(error?.statusCode || 500).json({
      success: false,
      message: error?.message || 'Internal server error'
    });
  }
};

const restorePatientMaterialUsage = async (req, res) => {
  try {
    const { id } = req.params;
    const existingRows = await query('SELECT * FROM patient_material_usages WHERE id = ? LIMIT 1', [id]);
    const existingUsage = existingRows[0];
    if (!existingUsage) {
      return res.status(404).json({
        success: false,
        message: 'Patient material usage not found'
      });
    }

    if (!existingUsage.deleted_at) {
      return res.status(400).json({
        success: false,
        message: 'Patient material usage is already active'
      });
    }

    await transaction(async (connection) => {
      const [usageRows] = await connection.execute(
        `SELECT *
         FROM patient_material_usages
         WHERE id = ? AND deleted_at IS NOT NULL
         LIMIT 1
         FOR UPDATE`,
        [id]
      );
      const usageRow = usageRows[0];
      if (!usageRow) {
        throw createHttpError('Patient material usage not found', 404);
      }

      const [itemRows] = await connection.execute(
        `SELECT id, name, quantity, deleted_at, purged_at
         FROM inventory_items
         WHERE id = ?
         LIMIT 1
         FOR UPDATE`,
        [usageRow.inventory_item_id]
      );
      const item = itemRows[0];
      if (!item || item.deleted_at || item.purged_at) {
        throw createHttpError('Linked inventory item is not available for restore');
      }

      if (Number(item.quantity) < Number(usageRow.quantity)) {
        throw createHttpError(`Insufficient stock to restore usage for ${item.name}`);
      }

      await connection.execute('UPDATE inventory_items SET quantity = quantity - ?, last_updated = NOW() WHERE id = ?', [usageRow.quantity, usageRow.inventory_item_id]);
      await connection.execute(
        `INSERT INTO inventory_transactions
          (item_id, transaction_type, quantity, reference_type, reference_id, performed_by, notes)
         VALUES (?, 'OUT', ?, 'USAGE', ?, ?, ?)`,
        [usageRow.inventory_item_id, usageRow.quantity, id, req.user.id, buildUsageTransactionNote(usageRow.patient_id, item.name, 'restore-usage', usageRow.notes, Number(id))]
      );

      await connection.execute(
        'UPDATE patient_material_usages SET deleted_at = NULL, deleted_by = NULL WHERE id = ?',
        [id]
      );
    });

    await logAuditEvent(req.user.id, 'RESTORE', 'PATIENT_MATERIAL_USAGE', Number(id), existingUsage, {
      deleted_at: null,
      deleted_by: null
    });

    return res.json({
      success: true,
      message: 'Patient material usage restored successfully'
    });
  } catch (error) {
    console.error('Restore patient material usage error:', error);
    return res.status(error?.statusCode || 500).json({
      success: false,
      message: error?.message || 'Internal server error'
    });
  }
};

module.exports = {
  getPatientMaterialUsages,
  getPatientMaterialUsageById,
  createPatientMaterialUsage,
  updatePatientMaterialUsage,
  deletePatientMaterialUsage,
  restorePatientMaterialUsage
};
