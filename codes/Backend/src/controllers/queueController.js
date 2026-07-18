const { 
  findOne, 
  findMany, 
  insert, 
  update, 
  remove,
  query
} = require('../config/database');
const { logAuditEvent } = require('../middleware/errorHandler');

const QUEUE_STATUSES = ['IN_WAITING_ROOM', 'UNDER_CONSULTATION', 'UNDER_TREATMENT', 'COMPLETED'];
const GLOBAL_QUEUE_ROLES = new Set(['ADMIN', 'NURSE', 'RECEPTION', 'ORTHODONTIST', 'DENTAL_SURGEON']);
const LOCAL_QUEUE_ROLES = new Set(['STUDENT']);

const normalizeQueueStatus = (status) => {
  const normalized = String(status || '').toUpperCase();
  const legacyMap = {
    WAITING: 'IN_WAITING_ROOM',
    PREPARATION: 'UNDER_CONSULTATION',
    IN_TREATMENT: 'UNDER_TREATMENT'
  };
  return legacyMap[normalized] || normalized || 'IN_WAITING_ROOM';
};

const cleanupCompletedQueueEntries = async () => {
  await query(
    `DELETE FROM queue
     WHERE status = 'COMPLETED'
       AND completion_time IS NOT NULL
       AND completion_time < DATE_SUB(NOW(), INTERVAL 24 HOUR)`
  );
};

const buildQueueScope = (user, alias = 'q', options = {}) => {
  const forceAssignedScope = options.assignedOnly && (GLOBAL_QUEUE_ROLES.has(user.role) || LOCAL_QUEUE_ROLES.has(user.role));

  if (GLOBAL_QUEUE_ROLES.has(user.role) && !forceAssignedScope) {
    return { clause: '', params: [] };
  }

  if (LOCAL_QUEUE_ROLES.has(user.role) || forceAssignedScope) {
    return {
      clause: `
        AND EXISTS (
          SELECT 1
          FROM patient_assignments pa_scope
          WHERE pa_scope.patient_id = ${alias}.patient_id
            AND pa_scope.user_id = ?
            AND pa_scope.assignment_role = ?
            AND pa_scope.active = TRUE
        )
      `,
      params: [user.id, user.role]
    };
  }

  return { clause: 'AND 1 = 0', params: [] };
};

const getQueueEntryForUser = async (queueId, user, permission = 'read') => {
  const scope = buildQueueScope(user, 'q');
  const rows = await query(
    `SELECT q.*
     FROM queue q
     WHERE q.id = ?
       ${scope.clause}
     LIMIT 1`,
    [queueId, ...scope.params]
  );

  if (!rows.length) {
    return null;
  }

  if (permission === 'delete' && user.role !== 'RECEPTION') {
    return null;
  }

  if (permission === 'update' && user.role === 'ADMIN') {
    return null;
  }

  return rows[0];
};

const queueSelectFields = `
  q.*,
  p.patient_code,
  CONCAT(p.first_name, ' ', p.last_name) as patient_name,
  TIMESTAMPDIFF(YEAR, p.date_of_birth, CURDATE()) as patient_age,
  p.gender as patient_gender,
  provider.name as provider_name,
  provider.role as provider_role,
  student.name as student_name,
  (
    SELECT GROUP_CONCAT(
      DISTINCT CONCAT(assigned_user.name, ' (', REPLACE(pa.assignment_role, '_', ' '), ')')
      ORDER BY pa.assignment_role, assigned_user.name
      SEPARATOR ', '
    )
    FROM patient_assignments pa
    INNER JOIN users assigned_user
      ON assigned_user.id = pa.user_id
     AND assigned_user.status = 'ACTIVE'
    WHERE pa.patient_id = q.patient_id
      AND pa.active = TRUE
      AND pa.assignment_role IN ('ORTHODONTIST', 'DENTAL_SURGEON', 'STUDENT')
  ) as assigned_clinical_staff
`;

const queueJoins = `
  LEFT JOIN patients p ON q.patient_id = p.id
  LEFT JOIN users provider ON q.provider_id = provider.id
  LEFT JOIN users student ON q.student_id = student.id
`;

// Get current queue
const getQueue = async (req, res) => {
  try {
    await cleanupCompletedQueueEntries();
    const { status, priority } = req.query;

    let whereClause = 'WHERE q.arrival_time >= CURDATE()';
    let queryParams = [];

    if (status) {
      whereClause += ' AND q.status = ?';
      queryParams.push(normalizeQueueStatus(status));
    }

    if (priority) {
      whereClause += ' AND q.priority = ?';
      queryParams.push(priority);
    }

    const scope = buildQueueScope(req.user, 'q', { assignedOnly: req.query.scope === 'assigned' });
    whereClause += ` ${scope.clause}`;
    queryParams.push(...scope.params);

    const queueQuery = `
      SELECT ${queueSelectFields}
      FROM queue q
      ${queueJoins}
      ${whereClause}
      ORDER BY 
        CASE q.status
          WHEN 'IN_WAITING_ROOM' THEN 1
          WHEN 'UNDER_CONSULTATION' THEN 2
          WHEN 'UNDER_TREATMENT' THEN 3
          WHEN 'COMPLETED' THEN 4
        END,
        CASE q.priority 
          WHEN 'URGENT' THEN 1
          WHEN 'HIGH' THEN 2
          WHEN 'NORMAL' THEN 3
          WHEN 'LOW' THEN 4
        END,
        q.arrival_time ASC
    `;

    const queue = await query(queueQuery, queryParams);

    // Calculate wait times
    const queueWithWaitTimes = queue.map(item => {
      const waitMinutes = item.start_time ?
        Math.floor((new Date(item.start_time) - new Date(item.arrival_time)) / 60000) :
        Math.floor((new Date() - new Date(item.arrival_time)) / 60000);

      return {
        ...item,
        wait_time_minutes: Math.max(0, waitMinutes),
        treatment_duration_minutes: item.start_time && item.completion_time ?
          Math.floor((new Date(item.completion_time) - new Date(item.start_time)) / 60000) :
          null
      };
    });

    // Get queue statistics
    const statsQuery = `
      SELECT 
        COUNT(*) as total_in_queue,
        COUNT(CASE WHEN q.status = 'IN_WAITING_ROOM' THEN 1 END) as waiting_count,
        COUNT(CASE WHEN q.status = 'UNDER_CONSULTATION' THEN 1 END) as under_consultation_count,
        COUNT(CASE WHEN q.status = 'UNDER_TREATMENT' THEN 1 END) as under_treatment_count,
        COUNT(CASE WHEN q.status = 'COMPLETED' THEN 1 END) as completed_count,
        COUNT(CASE WHEN q.priority = 'URGENT' THEN 1 END) as urgent_count,
        COUNT(CASE WHEN q.priority = 'HIGH' THEN 1 END) as high_priority_count,
        AVG(TIMESTAMPDIFF(MINUTE, arrival_time, NOW())) as avg_wait_time
      FROM queue q
      WHERE q.arrival_time >= CURDATE()
        ${scope.clause}
    `;

    const stats = await query(statsQuery, scope.params);

    res.json({
      success: true,
      data: {
        queue: queueWithWaitTimes,
        statistics: stats[0]
      }
    });
  } catch (error) {
    console.error('Get queue error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
};

// Add patient to queue
const addToQueue = async (req, res) => {
  try {
    if (req.user.role !== 'RECEPTION') {
      return res.status(403).json({
        success: false,
        message: 'Only receptionists can add patients to the live clinic queue'
      });
    }

    await cleanupCompletedQueueEntries();
    const queueData = {
      ...req.body,
      status: normalizeQueueStatus(req.body.status)
    };

    // Check if patient exists
    const patient = await findOne('patients', { id: queueData.patient_id, deleted_at: null });
    if (!patient) {
      return res.status(404).json({
        success: false,
        message: 'Patient not found'
      });
    }

    // Check if patient is already in queue
    const existingInQueue = await findOne('queue', {
      patient_id: queueData.patient_id,
      status: ['IN_WAITING_ROOM', 'UNDER_CONSULTATION', 'UNDER_TREATMENT']
    });
    
    if (existingInQueue) {
      return res.status(400).json({
        success: false,
        message: 'Patient is already in queue'
      });
    }

    // Validate provider and student if provided
    if (queueData.provider_id) {
      const provider = await findOne('users', { id: queueData.provider_id, status: 'ACTIVE' });
      if (!provider) {
        return res.status(400).json({
          success: false,
          message: 'Provider not found or inactive'
        });
      }
    }

    if (queueData.student_id) {
      const student = await findOne('users', { id: queueData.student_id, status: 'ACTIVE', role: 'STUDENT' });
      if (!student) {
        return res.status(400).json({
          success: false,
          message: 'Student not found or inactive'
        });
      }
    }

    // Add to queue
    const queueId = await insert('queue', {
      ...queueData,
      status: QUEUE_STATUSES.includes(queueData.status) ? queueData.status : 'IN_WAITING_ROOM',
      arrival_time: new Date()
    });

    await logAuditEvent(req.user.id, 'CREATE', 'QUEUE', queueId, null, queueData);

    // Return created queue entry with details
    const createdQueueQuery = `
      SELECT ${queueSelectFields}
      FROM queue q
      ${queueJoins}
      WHERE q.id = ?
    `;

    const createdQueue = await query(createdQueueQuery, [queueId]);

    res.status(201).json({
      success: true,
      message: 'Patient added to queue successfully',
      data: createdQueue[0]
    });
  } catch (error) {
    console.error('Add to queue error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
};

// Update queue status
const updateQueueStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { notes, provider_id, student_id } = req.body;
    const status = normalizeQueueStatus(req.body.status);

    if (!QUEUE_STATUSES.includes(status)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid queue status'
      });
    }

    // Check if queue entry exists
    const existingQueue = await getQueueEntryForUser(id, req.user, 'update');
    if (!existingQueue) {
      return res.status(403).json({
        success: false,
        message: 'Queue entry not found or not accessible'
      });
    }

    const updateData = { status };
    
    if (notes) updateData.notes = notes;
    if (provider_id) updateData.provider_id = provider_id;
    if (student_id) updateData.student_id = student_id;

    // Handle timestamps based on status
    if (status === 'UNDER_TREATMENT' && existingQueue.status !== 'UNDER_TREATMENT') {
      updateData.start_time = new Date();
    }
    
    if (status === 'COMPLETED') {
      updateData.completion_time = new Date();
      if (!existingQueue.start_time) {
        updateData.start_time = new Date();
      }
    }

    // Update queue entry
    await update('queue', updateData, { id });

    await logAuditEvent(req.user.id, 'UPDATE', 'QUEUE', id, existingQueue, updateData);

    // Return updated queue entry with details
    const updatedQueueQuery = `
      SELECT ${queueSelectFields}
      FROM queue q
      ${queueJoins}
      WHERE q.id = ?
    `;

    const updatedQueue = await query(updatedQueueQuery, [id]);

    res.json({
      success: true,
      message: 'Queue status updated successfully',
      data: updatedQueue[0]
    });
  } catch (error) {
    console.error('Update queue status error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
};

// Remove from queue
const removeFromQueue = async (req, res) => {
  try {
    const { id } = req.params;

    // Check if queue entry exists
    const existingQueue = await getQueueEntryForUser(id, req.user, 'delete');
    if (!existingQueue) {
      return res.status(403).json({
        success: false,
        message: 'Only receptionists can delete queue entries'
      });
    }

    // Remove from queue
    await remove('queue', { id }, false);

    await logAuditEvent(req.user.id, 'DELETE', 'QUEUE', id, existingQueue, null);

    res.json({
      success: true,
      message: 'Patient removed from queue successfully'
    });
  } catch (error) {
    console.error('Remove from queue error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
};

// Get queue statistics
const getQueueStats = async (req, res) => {
  try {
    await cleanupCompletedQueueEntries();
    const { period = 'today' } = req.query;

    let dateFilter;
    switch (period) {
      case 'today':
        dateFilter = 'DATE(q.arrival_time) = CURDATE()';
        break;
      case 'week':
        dateFilter = 'q.arrival_time >= DATE_SUB(NOW(), INTERVAL 1 WEEK)';
        break;
      case 'month':
        dateFilter = 'q.arrival_time >= DATE_SUB(NOW(), INTERVAL 1 MONTH)';
        break;
      default:
        dateFilter = 'DATE(q.arrival_time) = CURDATE()';
    }

    const scope = buildQueueScope(req.user, 'q');

    const statsQuery = `
      SELECT 
        COUNT(*) as total_patients,
        COUNT(CASE WHEN q.status = 'COMPLETED' THEN 1 END) as completed,
        COUNT(CASE WHEN q.status = 'IN_WAITING_ROOM' THEN 1 END) as waiting,
        COUNT(CASE WHEN q.status = 'UNDER_CONSULTATION' THEN 1 END) as under_consultation,
        COUNT(CASE WHEN q.status = 'UNDER_TREATMENT' THEN 1 END) as under_treatment,
        AVG(TIMESTAMPDIFF(MINUTE, arrival_time, COALESCE(completion_time, NOW()))) as avg_total_time,
        AVG(TIMESTAMPDIFF(MINUTE, arrival_time, start_time)) as avg_wait_time,
        AVG(TIMESTAMPDIFF(MINUTE, start_time, completion_time)) as avg_treatment_time
      FROM queue q
      WHERE ${dateFilter}
        ${scope.clause}
    `;

    const stats = await query(statsQuery, scope.params);

    // Hourly queue volume
    const hourlyStatsQuery = `
      SELECT 
        HOUR(arrival_time) as hour,
        COUNT(*) as patient_count
      FROM queue 
      WHERE ${dateFilter}
      GROUP BY HOUR(arrival_time)
      ORDER BY hour ASC
    `;

    const hourlyStats = await query(
      hourlyStatsQuery.replace('FROM queue ', 'FROM queue q ').replace(`WHERE ${dateFilter}`, `WHERE ${dateFilter} ${scope.clause}`),
      scope.params
    );

    // Provider workload
    const providerStatsQuery = `
      SELECT 
        u.name as provider_name,
        COUNT(*) as patient_count,
        AVG(TIMESTAMPDIFF(MINUTE, q.arrival_time, q.completion_time)) as avg_treatment_time
      FROM queue q
      LEFT JOIN users u ON q.provider_id = u.id
      WHERE ${dateFilter} AND q.provider_id IS NOT NULL
        ${scope.clause}
      GROUP BY q.provider_id, u.name
      ORDER BY patient_count DESC
    `;

    const providerStats = await query(providerStatsQuery, scope.params);

    res.json({
      success: true,
      data: {
        overview: stats[0],
        hourly_volume: hourlyStats,
        provider_workload: providerStats
      }
    });
  } catch (error) {
    console.error('Get queue stats error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
};

module.exports = {
  getQueue,
  addToQueue,
  updateQueueStatus,
  removeFromQueue,
  getQueueStats
};
