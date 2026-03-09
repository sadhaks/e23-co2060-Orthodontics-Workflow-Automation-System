const { query, transaction } = require('../config/database');

let cleanupIntervalId = null;
let cleanupRunning = false;

const parsePositiveInt = (value, fallback) => {
  const parsed = Number.parseInt(String(value), 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
};

const parseBoolean = (value, fallback) => {
  if (value === undefined || value === null || value === '') {
    return fallback;
  }
  const normalized = String(value).trim().toLowerCase();
  if (['1', 'true', 'yes', 'on'].includes(normalized)) return true;
  if (['0', 'false', 'no', 'off'].includes(normalized)) return false;
  return fallback;
};

const loadRetentionConfig = () => ({
  enabled: parseBoolean(process.env.AUDIT_LOG_RETENTION_ENABLED, true),
  retentionDays: parsePositiveInt(process.env.AUDIT_LOG_RETENTION_DAYS, 180),
  intervalHours: parsePositiveInt(process.env.AUDIT_LOG_CLEANUP_INTERVAL_HOURS, 24),
  batchSize: parsePositiveInt(process.env.AUDIT_LOG_CLEANUP_BATCH_SIZE, 5000),
  archiveBeforeDelete: parseBoolean(process.env.AUDIT_LOG_ARCHIVE_BEFORE_DELETE, false)
});

const ensureArchiveTable = async () => {
  await query(`
    CREATE TABLE IF NOT EXISTS audit_logs_archive (
      archive_id BIGINT AUTO_INCREMENT PRIMARY KEY,
      original_id INT NOT NULL,
      user_id INT NULL,
      action VARCHAR(100) NOT NULL,
      entity_type VARCHAR(50) NOT NULL,
      entity_id INT NULL,
      old_values JSON NULL,
      new_values JSON NULL,
      ip_address VARCHAR(45),
      user_agent TEXT,
      timestamp TIMESTAMP NULL,
      archived_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_archive_original_id (original_id),
      INDEX idx_archive_user_id (user_id),
      INDEX idx_archive_action (action),
      INDEX idx_archive_entity (entity_type, entity_id),
      INDEX idx_archive_timestamp (timestamp),
      INDEX idx_archive_archived_at (archived_at)
    )
  `);
};

const processSingleBatch = async ({ retentionDays, batchSize, archiveBeforeDelete }) => {
  return transaction(async (connection) => {
    const [rows] = await connection.query(
      `SELECT id
       FROM audit_logs
       WHERE timestamp < DATE_SUB(NOW(), INTERVAL ? DAY)
       ORDER BY id ASC
       LIMIT ?`,
      [retentionDays, batchSize]
    );

    if (!rows.length) {
      return 0;
    }

    const ids = rows.map((row) => row.id);
    const placeholders = ids.map(() => '?').join(', ');

    if (archiveBeforeDelete) {
      await connection.query(
        `INSERT INTO audit_logs_archive (
           original_id, user_id, action, entity_type, entity_id,
           old_values, new_values, ip_address, user_agent, timestamp
         )
         SELECT
           id, user_id, action, entity_type, entity_id,
           old_values, new_values, ip_address, user_agent, timestamp
         FROM audit_logs
         WHERE id IN (${placeholders})`,
        ids
      );
    }

    const [deleteResult] = await connection.query(
      `DELETE FROM audit_logs WHERE id IN (${placeholders})`,
      ids
    );

    return Number(deleteResult.affectedRows || 0);
  });
};

const runAuditLogCleanup = async () => {
  const config = loadRetentionConfig();
  if (!config.enabled) {
    return { skipped: true, reason: 'disabled' };
  }

  if (cleanupRunning) {
    return { skipped: true, reason: 'already_running' };
  }

  cleanupRunning = true;
  try {
    if (config.archiveBeforeDelete) {
      await ensureArchiveTable();
    }

    let totalDeleted = 0;
    while (true) {
      const deletedInBatch = await processSingleBatch(config);
      if (deletedInBatch === 0) break;
      totalDeleted += deletedInBatch;
    }

    return {
      skipped: false,
      deleted: totalDeleted,
      retentionDays: config.retentionDays,
      archiveBeforeDelete: config.archiveBeforeDelete
    };
  } finally {
    cleanupRunning = false;
  }
};

const startAuditLogRetentionJob = () => {
  const config = loadRetentionConfig();
  if (!config.enabled) {
    console.log('Audit retention: disabled (AUDIT_LOG_RETENTION_ENABLED=false)');
    return null;
  }

  const intervalMs = config.intervalHours * 60 * 60 * 1000;
  console.log(
    `Audit retention: enabled (keep ${config.retentionDays} days, run every ${config.intervalHours}h, batch ${config.batchSize}, archive=${config.archiveBeforeDelete})`
  );

  const runAndLog = async () => {
    try {
      const result = await runAuditLogCleanup();
      if (!result.skipped) {
        console.log(
          `Audit retention cleanup completed: deleted=${result.deleted}, keep_days=${result.retentionDays}, archive=${result.archiveBeforeDelete}`
        );
      }
    } catch (error) {
      console.error('Audit retention cleanup failed:', error.message);
    }
  };

  setTimeout(runAndLog, 15 * 1000);
  cleanupIntervalId = setInterval(runAndLog, intervalMs);
  return cleanupIntervalId;
};

const stopAuditLogRetentionJob = () => {
  if (cleanupIntervalId) {
    clearInterval(cleanupIntervalId);
    cleanupIntervalId = null;
  }
};

module.exports = {
  startAuditLogRetentionJob,
  stopAuditLogRetentionJob,
  runAuditLogCleanup
};
