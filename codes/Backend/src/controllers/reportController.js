const { query } = require('../config/database');

const parsePositiveInt = (value, fallback) => {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallback;
  }
  return parsed;
};

// Get patient status report
const getPatientStatusReport = async (req, res) => {
  try {
    const { start_date, end_date, group_by = 'status' } = req.query;

    let dateFilter = '';
    let queryParams = [];

    if (start_date && end_date) {
      dateFilter = 'WHERE created_at BETWEEN ? AND ?';
      queryParams = [start_date, end_date];
    } else if (start_date) {
      dateFilter = 'WHERE created_at >= ?';
      queryParams = [start_date];
    } else if (end_date) {
      dateFilter = 'WHERE created_at <= ?';
      queryParams = [end_date];
    }

    let groupByClause;
    switch (group_by) {
      case 'status':
        groupByClause = 'status';
        break;
      case 'gender':
        groupByClause = 'gender';
        break;
      case 'age_group':
        groupByClause = `
          CASE 
            WHEN TIMESTAMPDIFF(YEAR, date_of_birth, CURDATE()) < 12 THEN 'Under 12'
            WHEN TIMESTAMPDIFF(YEAR, date_of_birth, CURDATE()) BETWEEN 12 AND 18 THEN '12-18'
            WHEN TIMESTAMPDIFF(YEAR, date_of_birth, CURDATE()) BETWEEN 19 AND 25 THEN '19-25'
            WHEN TIMESTAMPDIFF(YEAR, date_of_birth, CURDATE()) BETWEEN 26 AND 35 THEN '26-35'
            ELSE 'Over 35'
          END
        `;
        break;
      case 'month':
        groupByClause = 'DATE_FORMAT(created_at, "%Y-%m")';
        break;
      default:
        groupByClause = 'status';
    }

    const reportQuery = `
      SELECT 
        ${groupByClause} as group_key,
        COUNT(*) as patient_count,
        AVG(TIMESTAMPDIFF(YEAR, date_of_birth, CURDATE())) as average_age,
        COUNT(CASE WHEN gender = 'MALE' THEN 1 END) as male_count,
        COUNT(CASE WHEN gender = 'FEMALE' THEN 1 END) as female_count,
        COUNT(CASE WHEN nhi_verified = TRUE THEN 1 END) as nhi_verified_count
      FROM patients 
      WHERE deleted_at IS NULL
        ${dateFilter ? 'AND ' + dateFilter.substring(6) : ''}
      GROUP BY ${groupByClause}
      ORDER BY patient_count DESC
    `;

    const reportData = await query(reportQuery, queryParams);

    // Get overall statistics
    const statsQuery = `
      SELECT 
        COUNT(*) as total_patients,
        COUNT(CASE WHEN status = 'ACTIVE' THEN 1 END) as active_patients,
        COUNT(CASE WHEN status = 'COMPLETED' THEN 1 END) as completed_patients,
        COUNT(CASE WHEN status = 'CONSULTATION' THEN 1 END) as consultation_patients,
        COUNT(CASE WHEN status = 'MAINTENANCE' THEN 1 END) as maintenance_patients,
        AVG(TIMESTAMPDIFF(YEAR, date_of_birth, CURDATE())) as overall_avg_age,
        COUNT(CASE WHEN nhi_verified = TRUE THEN 1 END) as total_nhi_verified
      FROM patients 
      WHERE deleted_at IS NULL
        ${dateFilter}
    `;

    const stats = await query(statsQuery, queryParams);

    res.json({
      success: true,
      data: {
        overview: stats[0],
        breakdown: reportData
      }
    });
  } catch (error) {
    console.error('Get patient status report error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
};

// Get visit summary report
const getVisitSummaryReport = async (req, res) => {
  try {
    const { start_date, end_date, provider_id, group_by = 'month' } = req.query;

    let dateFilter = '';
    let queryParams = [];

    if (start_date && end_date) {
      dateFilter = 'AND visit_date BETWEEN ? AND ?';
      queryParams = [start_date, end_date];
    } else if (start_date) {
      dateFilter = 'AND visit_date >= ?';
      queryParams = [start_date];
    } else if (end_date) {
      dateFilter = 'AND visit_date <= ?';
      queryParams = [end_date];
    }

    let providerFilter = '';
    if (provider_id) {
      providerFilter = 'AND v.provider_id = ?';
      queryParams.push(provider_id);
    }

    let groupByClause;
    switch (group_by) {
      case 'month':
        groupByClause = 'DATE_FORMAT(visit_date, "%Y-%m")';
        break;
      case 'week':
        groupByClause = 'YEARWEEK(visit_date)';
        break;
      case 'day':
        groupByClause = 'DATE(visit_date)';
        break;
      case 'provider':
        groupByClause = 'u.name';
        break;
      case 'status':
        groupByClause = 'v.status';
        break;
      default:
        groupByClause = 'DATE_FORMAT(visit_date, "%Y-%m")';
    }

    const reportQuery = `
      SELECT 
        ${groupByClause} as group_key,
        COUNT(*) as total_visits,
        COUNT(CASE WHEN v.status = 'COMPLETED' THEN 1 END) as completed_visits,
        COUNT(CASE WHEN v.status = 'SCHEDULED' THEN 1 END) as scheduled_visits,
        COUNT(CASE WHEN v.status = 'CANCELLED' THEN 1 END) as cancelled_visits,
        AVG(
          CASE
            WHEN v.status = 'COMPLETED' THEN TIMESTAMPDIFF(MINUTE, v.visit_date, v.updated_at)
            ELSE NULL
          END
        ) as avg_duration_minutes
      FROM visits v
      LEFT JOIN users u ON v.provider_id = u.id
      WHERE 1=1
        ${dateFilter}
        ${providerFilter}
      GROUP BY ${groupByClause}
      ORDER BY group_key DESC
    `;

    const reportData = await query(reportQuery, queryParams);

    // Get procedure type statistics
    const providerFilterNoAlias = provider_id ? 'AND provider_id = ?' : '';
    const procedureStatsQuery = `
      SELECT 
        procedure_type,
        COUNT(*) as count,
        COUNT(CASE WHEN status = 'COMPLETED' THEN 1 END) as completed_count
      FROM visits 
      WHERE 1=1
        ${dateFilter}
        ${providerFilterNoAlias}
        AND procedure_type IS NOT NULL
        AND procedure_type != ''
      GROUP BY procedure_type
      ORDER BY count DESC
      LIMIT 20
    `;

    const procedureStats = await query(procedureStatsQuery, queryParams);

    // Get provider workload
    const providerStatsQuery = `
      SELECT 
        u.name as provider_name,
        u.role as provider_role,
        COUNT(*) as total_visits,
        COUNT(CASE WHEN v.status = 'COMPLETED' THEN 1 END) as completed_visits,
        AVG(
          CASE
            WHEN v.status = 'COMPLETED' THEN TIMESTAMPDIFF(MINUTE, v.visit_date, v.updated_at)
            ELSE NULL
          END
        ) as avg_duration
      FROM visits v
      LEFT JOIN users u ON v.provider_id = u.id
      WHERE 1=1
        ${dateFilter}
        AND v.provider_id IS NOT NULL
      GROUP BY v.provider_id, u.name, u.role
      ORDER BY total_visits DESC
      LIMIT 10
    `;

    const providerStats = await query(providerStatsQuery, queryParams);

    res.json({
      success: true,
      data: {
        trends: reportData,
        procedure_breakdown: procedureStats,
        provider_workload: providerStats
      }
    });
  } catch (error) {
    console.error('Get visit summary report error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
};

// Get inventory alerts report
const getInventoryAlertsReport = async (req, res) => {
  try {
    const { alert_type = 'all' } = req.query;

    let whereClause = '';
    switch (alert_type) {
      case 'out_of_stock':
        whereClause = 'WHERE i.deleted_at IS NULL AND i.purged_at IS NULL AND i.quantity = 0';
        break;
      case 'low_stock':
        whereClause = 'WHERE i.deleted_at IS NULL AND i.purged_at IS NULL AND i.quantity <= i.minimum_threshold AND i.quantity > 0';
        break;
      case 'critical':
        whereClause = 'WHERE i.deleted_at IS NULL AND i.purged_at IS NULL AND i.quantity <= i.minimum_threshold / 2';
        break;
      default:
        whereClause = 'WHERE i.deleted_at IS NULL AND i.purged_at IS NULL AND i.quantity <= i.minimum_threshold';
    }

    const alertsQuery = `
      SELECT 
        i.*,
        CASE 
          WHEN i.quantity = 0 THEN 'OUT_OF_STOCK'
          WHEN i.quantity <= i.minimum_threshold / 2 THEN 'CRITICAL'
          ELSE 'LOW_STOCK'
        END as alert_level,
        (i.minimum_threshold - i.quantity) as shortage_quantity,
        ROUND(((i.minimum_threshold - i.quantity) / NULLIF(i.minimum_threshold, 0)) * 100, 2) as shortage_percentage
      FROM inventory_items i
      ${whereClause}
      ORDER BY 
        CASE 
          WHEN i.quantity = 0 THEN 1
          WHEN i.quantity <= i.minimum_threshold / 2 THEN 2
          ELSE 3
        END,
        shortage_percentage DESC
    `;

    const alerts = await query(alertsQuery);

    // Get inventory summary
    const summaryQuery = `
      SELECT 
        COUNT(*) as total_items,
        COUNT(CASE WHEN quantity = 0 THEN 1 END) as out_of_stock_count,
        COUNT(CASE WHEN quantity <= minimum_threshold AND quantity > 0 THEN 1 END) as low_stock_count,
        COUNT(CASE WHEN quantity <= minimum_threshold / 2 THEN 1 END) as critical_count,
        COUNT(CASE WHEN quantity > minimum_threshold THEN 1 END) as normal_count,
        SUM(quantity) as total_quantity,
        SUM(CASE WHEN quantity <= minimum_threshold THEN quantity ELSE 0 END) as at_risk_quantity
      FROM inventory_items
      WHERE deleted_at IS NULL
        AND purged_at IS NULL
    `;

    const summary = await query(summaryQuery);

    // Get category breakdown
    const categoryBreakdownQuery = `
      SELECT 
        category,
        COUNT(*) as total_items,
        COUNT(CASE WHEN quantity = 0 THEN 1 END) as out_of_stock,
        COUNT(CASE WHEN quantity <= minimum_threshold THEN 1 END) as low_stock,
        SUM(quantity) as total_quantity
      FROM inventory_items
      WHERE deleted_at IS NULL
        AND purged_at IS NULL
      GROUP BY category
      ORDER BY low_stock DESC, total_items DESC
    `;

    const categoryBreakdown = await query(categoryBreakdownQuery);

    // Get recent stock movements for alerted items
    const recentMovementsQuery = `
      SELECT 
        it.*,
        ii.name as item_name,
        ii.category as item_category,
        u.name as performed_by_name
      FROM inventory_transactions it
      LEFT JOIN inventory_items ii ON it.item_id = ii.id
      LEFT JOIN users u ON it.performed_by = u.id
      WHERE it.item_id IN (
        SELECT id FROM inventory_items WHERE deleted_at IS NULL AND purged_at IS NULL AND quantity <= minimum_threshold
      )
      ORDER BY it.created_at DESC
      LIMIT 50
    `;

    const recentMovements = await query(recentMovementsQuery);

    res.json({
      success: true,
      data: {
        overview: summary[0],
        alerts: alerts,
        category_breakdown: categoryBreakdown,
        recent_movements: recentMovements
      }
    });
  } catch (error) {
    console.error('Get inventory alerts report error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
};

// Get comprehensive dashboard report
const getDashboardReport = async (req, res) => {
  try {
    const { period = 'month' } = req.query;

    let dateFilter;
    switch (period) {
      case 'week':
        dateFilter = 'DATE_SUB(NOW(), INTERVAL 1 WEEK)';
        break;
      case 'month':
        dateFilter = 'DATE_SUB(NOW(), INTERVAL 1 MONTH)';
        break;
      case 'quarter':
        dateFilter = 'DATE_SUB(NOW(), INTERVAL 3 MONTH)';
        break;
      case 'year':
        dateFilter = 'DATE_SUB(NOW(), INTERVAL 1 YEAR)';
        break;
      default:
        dateFilter = 'DATE_SUB(NOW(), INTERVAL 1 MONTH)';
    }

    // Get key metrics
    const metricsQuery = `
      SELECT 
        (SELECT COUNT(*) FROM patients WHERE deleted_at IS NULL) as total_patients,
        (SELECT COUNT(*) FROM patients WHERE status = 'ACTIVE' AND deleted_at IS NULL) as active_patients,
        (SELECT COUNT(*) FROM visits WHERE visit_date >= ${dateFilter}) as period_visits,
        (SELECT COUNT(*) FROM visits WHERE visit_date >= ${dateFilter} AND status = 'COMPLETED') as completed_visits,
        (SELECT COUNT(*) FROM cases WHERE created_at >= ${dateFilter}) as period_cases,
        (SELECT COUNT(*) FROM cases WHERE status = 'VERIFIED') as verified_cases,
        (SELECT COUNT(*) FROM inventory_items WHERE deleted_at IS NULL AND purged_at IS NULL AND quantity <= minimum_threshold) as inventory_alerts,
        (SELECT COUNT(*) FROM users WHERE status = 'ACTIVE') as active_users
    `;

    const metrics = await query(metricsQuery);

    // Get patient admission trends
    const patientTrendsQuery = `
      SELECT 
        DATE_FORMAT(created_at, '%Y-%m-%d') as date,
        COUNT(*) as new_patients
      FROM patients 
      WHERE created_at >= DATE_SUB(NOW(), INTERVAL 30 DAY)
        AND deleted_at IS NULL
      GROUP BY DATE_FORMAT(created_at, '%Y-%m-%d')
      ORDER BY date ASC
    `;

    const patientTrends = await query(patientTrendsQuery);

    // Get visit trends
    const visitTrendsQuery = `
      SELECT 
        DATE_FORMAT(visit_date, '%Y-%m-%d') as date,
        COUNT(*) as visits,
        COUNT(CASE WHEN status = 'COMPLETED' THEN 1 END) as completed
      FROM visits 
      WHERE visit_date >= DATE_SUB(NOW(), INTERVAL 30 DAY)
      GROUP BY DATE_FORMAT(visit_date, '%Y-%m-%d')
      ORDER BY date ASC
    `;

    const visitTrends = await query(visitTrendsQuery);

    // Get top procedures
    const topProceduresQuery = `
      SELECT 
        procedure_type,
        COUNT(*) as count
      FROM visits 
      WHERE visit_date >= ${dateFilter}
        AND procedure_type IS NOT NULL
        AND procedure_type != ''
      GROUP BY procedure_type
      ORDER BY count DESC
      LIMIT 10
    `;

    const topProcedures = await query(topProceduresQuery);

    // Get department activity
    const departmentActivityQuery = `
      SELECT 
        u.department,
        COUNT(DISTINCT u.id) as user_count,
        COUNT(DISTINCT v.id) as visit_count,
        COUNT(DISTINCT c.id) as case_count
      FROM users u
      LEFT JOIN visits v ON u.id = v.provider_id AND v.visit_date >= ${dateFilter}
      LEFT JOIN cases c ON u.id = c.student_id AND c.created_at >= ${dateFilter}
      WHERE u.status = 'ACTIVE' AND u.department IS NOT NULL
      GROUP BY u.department
      ORDER BY visit_count DESC
    `;

    const departmentActivity = await query(departmentActivityQuery);

    // Get student progress
    const studentProgressQuery = `
      SELECT 
        u.name as student_name,
        COUNT(*) as total_cases,
        COUNT(CASE WHEN c.status = 'VERIFIED' THEN 1 END) as verified_cases,
        ROUND(
          (COUNT(CASE WHEN c.status = 'VERIFIED' THEN 1 END) / 
          NULLIF(COUNT(*), 0)) * 100, 2
        ) as completion_rate
      FROM users u
      LEFT JOIN cases c ON u.id = c.student_id
      WHERE u.role = 'STUDENT' AND u.status = 'ACTIVE'
      GROUP BY u.id, u.name
      HAVING total_cases > 0
      ORDER BY verified_cases DESC
      LIMIT 10
    `;

    const studentProgress = await query(studentProgressQuery);

    res.json({
      success: true,
      data: {
        metrics: metrics[0],
        patient_trends: patientTrends,
        visit_trends: visitTrends,
        top_procedures: topProcedures,
        department_activity: departmentActivity,
        student_progress: studentProgress
      }
    });
  } catch (error) {
    console.error('Get dashboard report error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
};

// Get audit logs report (Admin-only, read-only)
const getAuditLogsReport = async (req, res) => {
  try {
    const page = parsePositiveInt(req.query.page, 1);
    const limit = Math.min(parsePositiveInt(req.query.limit, 25), 200);
    const offset = (page - 1) * limit;

    const {
      action,
      role,
      entity_type,
      user_id,
      search,
      start_date,
      end_date
    } = req.query;

    const whereClauses = [];
    const params = [];

    if (action) {
      whereClauses.push('al.action = ?');
      params.push(String(action));
    }

    if (role) {
      whereClauses.push('u.role = ?');
      params.push(String(role));
    }

    if (entity_type) {
      whereClauses.push('al.entity_type = ?');
      params.push(String(entity_type));
    }

    if (user_id) {
      whereClauses.push('al.user_id = ?');
      params.push(Number(user_id));
    }

    if (search) {
      const like = `%${String(search).trim()}%`;
      whereClauses.push('(u.name LIKE ? OR u.email LIKE ? OR al.action LIKE ? OR al.entity_type LIKE ? OR IFNULL(al.ip_address, "") LIKE ?)');
      params.push(like, like, like, like, like);
    }

    if (start_date) {
      whereClauses.push('al.timestamp >= ?');
      params.push(String(start_date));
    }

    if (end_date) {
      whereClauses.push('al.timestamp <= ?');
      params.push(String(end_date));
    }

    const whereSql = whereClauses.length > 0 ? `WHERE ${whereClauses.join(' AND ')}` : '';

    const totalRows = await query(
      `SELECT COUNT(*) AS total
       FROM audit_logs al
       LEFT JOIN users u ON u.id = al.user_id
       ${whereSql}`,
      params
    );

    const logs = await query(
      `SELECT
         al.id,
         al.user_id,
         COALESCE(u.name, 'Deleted User') AS user_name,
         COALESCE(u.email, 'deleted@user.local') AS user_email,
         COALESCE(u.role, 'UNKNOWN') AS user_role,
         al.action,
         al.entity_type,
         al.entity_id,
         al.old_values,
         al.new_values,
         al.ip_address,
         al.user_agent,
         al.timestamp
       FROM audit_logs al
       LEFT JOIN users u ON u.id = al.user_id
       ${whereSql}
       ORDER BY al.timestamp DESC, al.id DESC
       LIMIT ? OFFSET ?`,
      [...params, limit, offset]
    );

    const total = Number(totalRows[0]?.total || 0);
    res.json({
      success: true,
      data: {
        logs,
        pagination: {
          current_page: page,
          total_pages: Math.max(1, Math.ceil(total / limit)),
          total_records: total,
          limit
        }
      }
    });
  } catch (error) {
    console.error('Get audit logs report error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
};

module.exports = {
  getPatientStatusReport,
  getVisitSummaryReport,
  getInventoryAlertsReport,
  getDashboardReport,
  getAuditLogsReport
};
