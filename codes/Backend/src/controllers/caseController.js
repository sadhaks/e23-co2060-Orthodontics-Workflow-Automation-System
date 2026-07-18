const { findOne, insert, query, update, remove } = require('../config/database');
const { logAuditEvent } = require('../middleware/errorHandler');
const {
  CASE_STATUSES,
  TASK_STATUSES,
  normalizeTaskStatus,
  logCaseEvent,
  ensureStudentCaseForAssignment,
  getCaseByIdWithRelations,
  hasActiveAssignmentForCaseUser,
  getTaskSummarySelect,
  getTaskSummaryJoin,
  getCaseTasks
} = require('../services/studentCaseService');

const parseRequirements = (value) => {
  if (!value) return null;
  if (typeof value === 'object') return value;
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
};

const hydrateCaseRow = (row) => {
  if (!row) return row;
  return {
    ...row,
    requirements_met: parseRequirements(row.requirements_met),
    progress_percentage: Number(row.progress_percentage || 0),
    total_tasks: Number(row.total_tasks || 0),
    completed_tasks: Number(row.completed_tasks || 0),
    reviewed_tasks: Number(row.reviewed_tasks || 0),
    pending_tasks: Number(row.pending_tasks || 0),
    overdue_tasks: Number(row.overdue_tasks || 0),
    student_assignment_active: row.student_assignment_active === undefined ? true : Boolean(Number(row.student_assignment_active)),
    patient_age: row.patient_dob
      ? Math.floor((new Date() - new Date(row.patient_dob)) / (365.25 * 24 * 60 * 60 * 1000))
      : row.patient_age
  };
};

const buildScopedCaseFilter = (user) => {
  const activeStudentAssignmentClause = `
    EXISTS (
      SELECT 1
      FROM patient_assignments pa_student
      WHERE pa_student.patient_id = c.patient_id
        AND pa_student.user_id = c.student_id
        AND pa_student.assignment_role = 'STUDENT'
        AND pa_student.active = TRUE
    )
  `;

  if (user.role === 'ADMIN') {
    return { clause: '1=1', params: [] };
  }

  if (['ORTHODONTIST', 'DENTAL_SURGEON'].includes(user.role)) {
    return {
      clause: `
        c.supervisor_id = ?
        AND EXISTS (
          SELECT 1
          FROM patient_assignments pa
          WHERE pa.patient_id = c.patient_id
            AND pa.user_id = ?
            AND pa.assignment_role = ?
            AND pa.active = TRUE
        )
      `,
      params: [user.id, user.id, user.role]
    };
  }

  if (user.role === 'STUDENT') {
    return {
      clause: `
        ${activeStudentAssignmentClause}
        AND
        c.student_id = ?
        AND EXISTS (
          SELECT 1
          FROM patient_assignments pa
          WHERE pa.patient_id = c.patient_id
            AND pa.user_id = ?
            AND pa.assignment_role = 'STUDENT'
            AND pa.active = TRUE
        )
      `,
      params: [user.id, user.id]
    };
  }

  return { clause: '1=0', params: [] };
};

const loadCaseOrThrow = async (req, res) => {
  const rows = await query(
    `SELECT
       c.*,
       EXISTS (
         SELECT 1
         FROM patient_assignments pa_student
         WHERE pa_student.patient_id = c.patient_id
           AND pa_student.user_id = c.student_id
           AND pa_student.assignment_role = 'STUDENT'
           AND pa_student.active = TRUE
       ) AS student_assignment_active,
       ${getTaskSummarySelect()}
     FROM cases c
     ${getTaskSummaryJoin()}
     WHERE c.id = ?
     LIMIT 1`,
    [Number(req.params.id)]
  );
  const rawCase = rows[0];

  if (!rawCase) {
    res.status(404).json({
      success: false,
      message: 'Case not found'
    });
    return null;
  }

  const fullCase = await getCaseByIdWithRelations(Number(rawCase.id));
  const allowed = await hasActiveAssignmentForCaseUser(fullCase, req.user);
  if (!allowed) {
    res.status(403).json({
      success: false,
      message: 'You do not have access to this student case'
    });
    return null;
  }

  return hydrateCaseRow({ ...fullCase, ...rawCase });
};

const requireSupervisorRole = (req, res, caseRow) => {
  if (!['ORTHODONTIST', 'DENTAL_SURGEON'].includes(req.user.role)) {
    res.status(403).json({
      success: false,
      message: 'Only the assigned supervisor can perform this action'
    });
    return false;
  }

  if (Number(caseRow.supervisor_id) !== Number(req.user.id)) {
    res.status(403).json({
      success: false,
      message: 'Only the assigned supervisor can perform this action'
    });
    return false;
  }

  return true;
};

const requireSupervisorOrAdminRole = (req, res, caseRow) => {
  if (req.user.role === 'ADMIN') {
    return true;
  }

  return requireSupervisorRole(req, res, caseRow);
};

const requireStudentRole = (req, res, caseRow) => {
  if (req.user.role !== 'STUDENT') {
    res.status(403).json({
      success: false,
      message: 'Only the assigned student can update task progress'
    });
    return false;
  }

  if (Number(caseRow.student_id) !== Number(req.user.id)) {
    res.status(403).json({
      success: false,
      message: 'Only the assigned student can update task progress'
    });
    return false;
  }

  return true;
};

const getCases = async (req, res) => {
  try {
    const { page = 1, limit = 10, status, student_id, supervisor_id, search } = req.query;
    const offset = (Number(page) - 1) * Number(limit);
    const scope = buildScopedCaseFilter(req.user);

    const whereParts = [scope.clause];
    const params = [...scope.params];

    if (status && CASE_STATUSES.includes(String(status).toUpperCase())) {
      whereParts.push('c.status = ?');
      params.push(String(status).toUpperCase());
    }

    if (student_id) {
      whereParts.push('c.student_id = ?');
      params.push(Number(student_id));
    }

    if (supervisor_id) {
      whereParts.push('c.supervisor_id = ?');
      params.push(Number(supervisor_id));
    }

    if (search) {
      const searchTerm = `%${search}%`;
      whereParts.push('(p.first_name LIKE ? OR p.last_name LIKE ? OR p.patient_code LIKE ? OR student.name LIKE ?)');
      params.push(searchTerm, searchTerm, searchTerm, searchTerm);
    }

    const whereClause = `WHERE ${whereParts.join(' AND ')}`;

    const countRows = await query(
      `SELECT COUNT(*) AS total
       FROM cases c
       INNER JOIN patients p ON p.id = c.patient_id
       ${whereClause}`,
      params
    );

    const rows = await query(
      `SELECT
         c.*,
         EXISTS (
           SELECT 1
           FROM patient_assignments pa_student
           WHERE pa_student.patient_id = c.patient_id
             AND pa_student.user_id = c.student_id
             AND pa_student.assignment_role = 'STUDENT'
             AND pa_student.active = TRUE
         ) AS student_assignment_active,
         ${getTaskSummarySelect()},
         p.patient_code,
         CONCAT(p.first_name, ' ', p.last_name) AS patient_name,
         TIMESTAMPDIFF(YEAR, p.date_of_birth, CURDATE()) AS patient_age,
         p.gender AS patient_gender,
         student.name AS student_name,
         supervisor.name AS supervisor_name
       FROM cases c
       INNER JOIN patients p ON p.id = c.patient_id
       INNER JOIN users student ON student.id = c.student_id
       INNER JOIN users supervisor ON supervisor.id = c.supervisor_id
       ${getTaskSummaryJoin()}
       ${whereClause}
       ORDER BY COALESCE(task_summary.last_task_update_at, c.updated_at) DESC, c.id DESC
       LIMIT ? OFFSET ?`,
      [...params, Number(limit), offset]
    );

    res.json({
      success: true,
      data: {
        cases: rows.map(hydrateCaseRow),
        pagination: {
          current_page: Number(page),
          total_pages: Math.ceil(Number(countRows[0]?.total || 0) / Number(limit || 1)),
          total_records: Number(countRows[0]?.total || 0),
          limit: Number(limit)
        }
      }
    });
  } catch (error) {
    console.error('Get cases error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
};

const getStudentCases = async (req, res) => {
  try {
    const { studentId } = req.params;
    const student = await findOne('users', { id: Number(studentId), role: 'STUDENT', status: 'ACTIVE' });
    if (!student) {
      return res.status(404).json({
        success: false,
        message: 'Student not found'
      });
    }

    if (req.user.role === 'STUDENT' && Number(req.user.id) !== Number(studentId)) {
      return res.status(403).json({
        success: false,
        message: 'You can only view your own student cases'
      });
    }

    const scope = buildScopedCaseFilter(req.user);
    const params = [...scope.params, Number(studentId)];
    const whereClause = `WHERE ${scope.clause} AND c.student_id = ?`;

    const rows = await query(
      `SELECT
         c.*,
         ${getTaskSummarySelect()},
         p.patient_code,
         CONCAT(p.first_name, ' ', p.last_name) AS patient_name,
         TIMESTAMPDIFF(YEAR, p.date_of_birth, CURDATE()) AS patient_age,
         p.gender AS patient_gender,
         supervisor.name AS supervisor_name
       FROM cases c
       INNER JOIN patients p ON p.id = c.patient_id
       INNER JOIN users supervisor ON supervisor.id = c.supervisor_id
       ${getTaskSummaryJoin()}
       ${whereClause}
       ORDER BY COALESCE(task_summary.last_task_update_at, c.updated_at) DESC, c.id DESC`,
      params
    );

    const progressRows = await query(
      `SELECT
         COUNT(*) AS total_cases,
         SUM(COALESCE(task_summary.total_tasks, 0)) AS total_tasks,
         SUM(COALESCE(task_summary.completed_tasks, 0)) AS completed_tasks,
         SUM(COALESCE(task_summary.reviewed_tasks, 0)) AS reviewed_tasks,
         SUM(COALESCE(task_summary.pending_tasks, 0)) AS pending_tasks,
         SUM(COALESCE(task_summary.overdue_tasks, 0)) AS overdue_tasks,
         ROUND(AVG(COALESCE(task_summary.progress_percentage, 0)), 0) AS avg_progress
       FROM cases c
       ${getTaskSummaryJoin()}
       ${whereClause}`,
      params
    );

    res.json({
      success: true,
      data: {
        cases: rows.map(hydrateCaseRow),
        progress: {
          ...progressRows[0],
          total_cases: Number(progressRows[0]?.total_cases || 0),
          total_tasks: Number(progressRows[0]?.total_tasks || 0),
          completed_tasks: Number(progressRows[0]?.completed_tasks || 0),
          reviewed_tasks: Number(progressRows[0]?.reviewed_tasks || 0),
          pending_tasks: Number(progressRows[0]?.pending_tasks || 0),
          overdue_tasks: Number(progressRows[0]?.overdue_tasks || 0),
          avg_progress: Number(progressRows[0]?.avg_progress || 0)
        }
      }
    });
  } catch (error) {
    console.error('Get student cases error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
};

const getCaseById = async (req, res) => {
  try {
    const caseRow = await loadCaseOrThrow(req, res);
    if (!caseRow) return;

    const [tasks, logs] = await Promise.all([
      getCaseTasks(Number(caseRow.id)),
      query(
        `SELECT l.*, u.name AS actor_name
         FROM case_progress_logs l
         INNER JOIN users u ON u.id = l.actor_id
         WHERE l.case_id = ?
         ORDER BY l.created_at ASC, l.id ASC`,
        [Number(caseRow.id)]
      )
    ]);

    res.json({
      success: true,
      data: {
        case: caseRow,
        tasks,
        logbook: logs.map((row) => ({
          ...row,
          progress_percentage: row.progress_percentage === null ? null : Number(row.progress_percentage),
          metadata: parseRequirements(row.metadata)
        }))
      }
    });
  } catch (error) {
    console.error('Get case error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
};

const createCase = async (req, res) => {
  try {
    if (!['ORTHODONTIST', 'DENTAL_SURGEON'].includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        message: 'Student cases are created from supervisor assignments'
      });
    }

    const patient = await findOne('patients', { id: Number(req.body.patient_id), deleted_at: null });
    const student = await findOne('users', { id: Number(req.body.student_id), role: 'STUDENT', status: 'ACTIVE' });
    if (!patient || !student || Number(req.body.supervisor_id) !== Number(req.user.id)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid patient, student, or supervisor'
      });
    }

    const result = await ensureStudentCaseForAssignment({
      patientId: Number(req.body.patient_id),
      studentId: Number(req.body.student_id),
      supervisorId: Number(req.user.id),
      supervisorRole: req.user.role,
      assignedBy: Number(req.user.id)
    });

    const createdCase = await loadCaseOrThrow({ ...req, params: { id: result.caseId } }, res);
    if (!createdCase) return;

    await logAuditEvent(req.user.id, result.created ? 'CREATE' : 'UPDATE', 'CASE', result.caseId, null, req.body);

    res.status(result.created ? 201 : 200).json({
      success: true,
      message: result.created ? 'Case created successfully' : 'Case already existed and was reused',
      data: createdCase
    });
  } catch (error) {
    console.error('Create case error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
};

const updateCase = async (req, res) => {
  return res.status(403).json({
    success: false,
    message: 'Student case progress is task-based. Direct case editing is not allowed.'
  });
};

const assignCaseTask = async (req, res) => {
  try {
    const caseRow = await loadCaseOrThrow(req, res);
    if (!caseRow) return;
    if (!requireSupervisorRole(req, res, caseRow)) return;

    const title = String(req.body.title || '').trim();
    const description = String(req.body.description || '').trim() || null;
    const deadlineAt = req.body.deadline_at || null;

    const taskId = await insert('case_tasks', {
      case_id: Number(caseRow.id),
      patient_id: Number(caseRow.patient_id),
      student_id: Number(caseRow.student_id),
      supervisor_id: Number(caseRow.supervisor_id),
      title,
      description,
      deadline_at: deadlineAt,
      status: 'ASSIGNED',
      created_by: Number(req.user.id)
    });

    await logCaseEvent({
      caseId: caseRow.id,
      patientId: caseRow.patient_id,
      actorId: req.user.id,
      actorRole: req.user.role,
      logType: 'SYSTEM_NOTE',
      title: `Supervisor assigned task: ${title}`,
      entryText: description,
      metadata: { task_id: taskId, deadline_at: deadlineAt }
    });

    await logAuditEvent(req.user.id, 'CREATE', 'CASE_TASK', taskId, null, {
      case_id: caseRow.id,
      title,
      deadline_at: deadlineAt
    });

    res.status(201).json({
      success: true,
      message: 'Task assigned successfully',
      data: (await getCaseTasks(Number(caseRow.id))).find((task) => Number(task.id) === Number(taskId)) || null
    });
  } catch (error) {
    console.error('Assign case task error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
};

const updateCaseTask = async (req, res) => {
  try {
    const caseRow = await loadCaseOrThrow(req, res);
    if (!caseRow) return;
    if (!requireStudentRole(req, res, caseRow)) return;

    const taskId = Number(req.params.taskId);
    const existingTask = await findOne('case_tasks', { id: taskId, case_id: Number(caseRow.id) });
    if (!existingTask) {
      return res.status(404).json({
        success: false,
        message: 'Task not found'
      });
    }

    const status = normalizeTaskStatus(req.body.status, existingTask.status);
    const completionNotes = req.body.completion_notes !== undefined
      ? String(req.body.completion_notes || '').trim() || null
      : existingTask.completion_notes;

    const updates = {
      status,
      completion_notes: completionNotes
    };

    if (status === 'COMPLETED') {
      updates.completed_at = new Date();
    } else if (status === 'ASSIGNED' || status === 'IN_PROGRESS') {
      updates.completed_at = null;
      updates.reviewed_at = null;
      updates.reviewed_by = null;
      updates.review_notes = null;
    }

    await update('case_tasks', updates, { id: taskId });

    await logCaseEvent({
      caseId: caseRow.id,
      patientId: caseRow.patient_id,
      actorId: req.user.id,
      actorRole: req.user.role,
      logType: 'STUDENT_PROGRESS',
      title: `Student marked task "${existingTask.title}" as ${status}`,
      entryText: completionNotes,
      metadata: { task_id: taskId, task_status: status }
    });

    await logAuditEvent(req.user.id, 'UPDATE', 'CASE_TASK', taskId, existingTask, updates);

    res.json({
      success: true,
      message: 'Task progress updated successfully',
      data: (await getCaseTasks(Number(caseRow.id))).find((task) => Number(task.id) === Number(taskId)) || null
    });
  } catch (error) {
    console.error('Update case task error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
};

const reviewCaseTask = async (req, res) => {
  try {
    const caseRow = await loadCaseOrThrow(req, res);
    if (!caseRow) return;
    if (!requireSupervisorRole(req, res, caseRow)) return;

    const taskId = Number(req.params.taskId);
    const existingTask = await findOne('case_tasks', { id: taskId, case_id: Number(caseRow.id) });
    if (!existingTask) {
      return res.status(404).json({
        success: false,
        message: 'Task not found'
      });
    }

    const reviewNotes = String(req.body.review_notes || '').trim();
    const status = normalizeTaskStatus(req.body.status, 'REVIEWED');
    const updates = {
      review_notes: reviewNotes || null,
      reviewed_by: Number(req.user.id),
      reviewed_at: new Date(),
      status
    };

    await update('case_tasks', updates, { id: taskId });

    await logCaseEvent({
      caseId: caseRow.id,
      patientId: caseRow.patient_id,
      actorId: req.user.id,
      actorRole: req.user.role,
      logType: 'SUPERVISOR_REVIEW',
      title: `Supervisor reviewed task "${existingTask.title}"`,
      entryText: reviewNotes || null,
      evaluation: status,
      metadata: { task_id: taskId }
    });

    await logAuditEvent(req.user.id, 'REVIEW', 'CASE_TASK', taskId, existingTask, updates);

    res.json({
      success: true,
      message: 'Task review recorded successfully',
      data: (await getCaseTasks(Number(caseRow.id))).find((task) => Number(task.id) === Number(taskId)) || null
    });
  } catch (error) {
    console.error('Review case task error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
};

const deleteCaseTask = async (req, res) => {
  try {
    const caseRow = await loadCaseOrThrow(req, res);
    if (!caseRow) return;
    if (!requireSupervisorRole(req, res, caseRow)) return;

    const taskId = Number(req.params.taskId);
    const existingTask = await findOne('case_tasks', { id: taskId, case_id: Number(caseRow.id) });
    if (!existingTask) {
      return res.status(404).json({
        success: false,
        message: 'Task not found'
      });
    }

    await logCaseEvent({
      caseId: caseRow.id,
      patientId: caseRow.patient_id,
      actorId: req.user.id,
      actorRole: req.user.role,
      logType: 'SYSTEM_NOTE',
      title: `Supervisor deleted task "${existingTask.title}"`,
      entryText: existingTask.description || null,
      metadata: {
        task_id: taskId,
        deleted_task: {
          title: existingTask.title,
          status: existingTask.status,
          completion_notes: existingTask.completion_notes,
          review_notes: existingTask.review_notes
        }
      }
    });

    await remove('case_tasks', { id: taskId }, false);
    await logAuditEvent(req.user.id, 'DELETE', 'CASE_TASK', taskId, existingTask, null);

    res.json({
      success: true,
      message: 'Task deleted successfully'
    });
  } catch (error) {
    console.error('Delete case task error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
};

const addCaseProgress = async (req, res) => {
  return res.status(403).json({
    success: false,
    message: 'Student progress is tracked through assigned tasks'
  });
};

const addCaseReview = async (req, res) => {
  return res.status(403).json({
    success: false,
    message: 'Supervisor review is tracked through task reviews'
  });
};

const deleteCase = async (req, res) => {
  try {
    const caseRow = await loadCaseOrThrow(req, res);
    if (!caseRow) return;
    if (!requireSupervisorOrAdminRole(req, res, caseRow)) return;

    if (caseRow.student_assignment_active) {
      return res.status(400).json({
        success: false,
        message: 'Remove the student from the patient care team before deleting this student case.'
      });
    }

    await remove('cases', { id: Number(caseRow.id) }, false);
    await logAuditEvent(req.user.id, 'DELETE', 'CASE', Number(caseRow.id), caseRow, null);

    res.json({
      success: true,
      message: 'Removed student case deleted successfully'
    });
  } catch (error) {
    console.error('Delete case error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
};

const getCaseStats = async (req, res) => {
  try {
    const scope = buildScopedCaseFilter(req.user);
    const rows = await query(
      `SELECT
         COUNT(*) AS total_cases,
         SUM(COALESCE(task_summary.total_tasks, 0)) AS total_tasks,
         SUM(COALESCE(task_summary.completed_tasks, 0)) AS completed_tasks,
         SUM(COALESCE(task_summary.reviewed_tasks, 0)) AS reviewed_tasks,
         SUM(COALESCE(task_summary.pending_tasks, 0)) AS pending_tasks,
         SUM(COALESCE(task_summary.overdue_tasks, 0)) AS overdue_tasks,
         ROUND(AVG(COALESCE(task_summary.progress_percentage, 0)), 0) AS avg_progress,
         COUNT(DISTINCT c.student_id) AS active_students
       FROM cases c
       ${getTaskSummaryJoin()}
       WHERE ${scope.clause}`,
      scope.params
    );

    res.json({
      success: true,
      data: {
        overview: {
          ...rows[0],
          total_cases: Number(rows[0]?.total_cases || 0),
          total_tasks: Number(rows[0]?.total_tasks || 0),
          completed_tasks: Number(rows[0]?.completed_tasks || 0),
          reviewed_tasks: Number(rows[0]?.reviewed_tasks || 0),
          pending_tasks: Number(rows[0]?.pending_tasks || 0),
          overdue_tasks: Number(rows[0]?.overdue_tasks || 0),
          avg_progress: Number(rows[0]?.avg_progress || 0)
        }
      }
    });
  } catch (error) {
    console.error('Get case stats error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
};

module.exports = {
  getCases,
  getStudentCases,
  getCaseById,
  createCase,
  updateCase,
  assignCaseTask,
  updateCaseTask,
  reviewCaseTask,
  deleteCaseTask,
  addCaseProgress,
  addCaseReview,
  deleteCase,
  getCaseStats
};
