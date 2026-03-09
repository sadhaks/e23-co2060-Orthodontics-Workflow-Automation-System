const { 
  findOne, 
  findMany, 
  insert, 
  update, 
  remove,
  query
} = require('../config/database');
const { logAuditEvent } = require('../middleware/errorHandler');

// Get current queue
const getQueue = async (req, res) => {
  try {
    const { status, priority } = req.query;

    let whereClause = 'WHERE q.status != "COMPLETED"';
    let queryParams = [];

    if (status) {
      whereClause += ' AND q.status = ?';
      queryParams.push(status);
    }

    if (priority) {
      whereClause += ' AND q.priority = ?';
      queryParams.push(priority);
    }

    const queueQuery = `
      SELECT 
        q.*,
        p.patient_code,
        CONCAT(p.first_name, ' ', p.last_name) as patient_name,
        TIMESTAMPDIFF(YEAR, p.date_of_birth, CURDATE()) as patient_age,
        p.gender as patient_gender,
        provider.name as provider_name,
        provider.role as provider_role,
        student.name as student_name
      FROM queue q
      LEFT JOIN patients p ON q.patient_id = p.id
      LEFT JOIN users provider ON q.provider_id = provider.id
      LEFT JOIN users student ON q.student_id = student.id
      ${whereClause}
      ORDER BY 
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
    const queueWithWaitTimes = queue.map(item => ({
      ...item,
      wait_time_minutes: item.start_time ? 
        Math.floor((new Date(item.start_time) - new Date(item.arrival_time)) / 60000) :
        Math.floor((new Date() - new Date(item.arrival_time)) / 60000),
      treatment_duration_minutes: item.start_time && item.completion_time ?
        Math.floor((new Date(item.completion_time) - new Date(item.start_time)) / 60000) :
        null
    }));

    // Get queue statistics
    const statsQuery = `
      SELECT 
        COUNT(*) as total_in_queue,
        COUNT(CASE WHEN status = 'WAITING' THEN 1 END) as waiting_count,
        COUNT(CASE WHEN status = 'IN_TREATMENT' THEN 1 END) as in_treatment_count,
        COUNT(CASE WHEN status = 'PREPARATION' THEN 1 END) as preparation_count,
        COUNT(CASE WHEN priority = 'URGENT' THEN 1 END) as urgent_count,
        COUNT(CASE WHEN priority = 'HIGH' THEN 1 END) as high_priority_count,
        AVG(TIMESTAMPDIFF(MINUTE, arrival_time, NOW())) as avg_wait_time
      FROM queue 
      WHERE status != 'COMPLETED'
    `;

    const stats = await query(statsQuery);

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
    const queueData = req.body;

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
      status: ['WAITING', 'IN_TREATMENT', 'PREPARATION'] 
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
      arrival_time: new Date()
    });

    await logAuditEvent(req.user.id, 'CREATE', 'QUEUE', queueId, null, queueData);

    // Return created queue entry with details
    const createdQueueQuery = `
      SELECT 
        q.*,
        p.patient_code,
        CONCAT(p.first_name, ' ', p.last_name) as patient_name,
        TIMESTAMPDIFF(YEAR, p.date_of_birth, CURDATE()) as patient_age,
        provider.name as provider_name,
        student.name as student_name
      FROM queue q
      LEFT JOIN patients p ON q.patient_id = p.id
      LEFT JOIN users provider ON q.provider_id = provider.id
      LEFT JOIN users student ON q.student_id = student.id
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
    const { status, notes, provider_id, student_id } = req.body;

    // Check if queue entry exists
    const existingQueue = await findOne('queue', { id });
    if (!existingQueue) {
      return res.status(404).json({
        success: false,
        message: 'Queue entry not found'
      });
    }

    const updateData = { status };
    
    if (notes) updateData.notes = notes;
    if (provider_id) updateData.provider_id = provider_id;
    if (student_id) updateData.student_id = student_id;

    // Handle timestamps based on status
    if (status === 'IN_TREATMENT' && existingQueue.status !== 'IN_TREATMENT') {
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
      SELECT 
        q.*,
        p.patient_code,
        CONCAT(p.first_name, ' ', p.last_name) as patient_name,
        TIMESTAMPDIFF(YEAR, p.date_of_birth, CURDATE()) as patient_age,
        provider.name as provider_name,
        student.name as student_name
      FROM queue q
      LEFT JOIN patients p ON q.patient_id = p.id
      LEFT JOIN users provider ON q.provider_id = provider.id
      LEFT JOIN users student ON q.student_id = student.id
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
    const existingQueue = await findOne('queue', { id });
    if (!existingQueue) {
      return res.status(404).json({
        success: false,
        message: 'Queue entry not found'
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

    const statsQuery = `
      SELECT 
        COUNT(*) as total_patients,
        COUNT(CASE WHEN status = 'COMPLETED' THEN 1 END) as completed,
        COUNT(CASE WHEN status = 'WAITING' THEN 1 END) as waiting,
        COUNT(CASE WHEN status = 'IN_TREATMENT' THEN 1 END) as in_treatment,
        COUNT(CASE WHEN status = 'PREPARATION' THEN 1 END) as preparation,
        AVG(TIMESTAMPDIFF(MINUTE, arrival_time, COALESCE(completion_time, NOW()))) as avg_total_time,
        AVG(TIMESTAMPDIFF(MINUTE, arrival_time, start_time)) as avg_wait_time,
        AVG(TIMESTAMPDIFF(MINUTE, start_time, completion_time)) as avg_treatment_time
      FROM queue q
      WHERE ${dateFilter}
    `;

    const stats = await query(statsQuery);

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

    const hourlyStats = await query(hourlyStatsQuery);

    // Provider workload
    const providerStatsQuery = `
      SELECT 
        u.name as provider_name,
        COUNT(*) as patient_count,
        AVG(TIMESTAMPDIFF(MINUTE, q.arrival_time, q.completion_time)) as avg_treatment_time
      FROM queue q
      LEFT JOIN users u ON q.provider_id = u.id
      WHERE ${dateFilter} AND q.provider_id IS NOT NULL
      GROUP BY q.provider_id, u.name
      ORDER BY patient_count DESC
    `;

    const providerStats = await query(providerStatsQuery);

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
