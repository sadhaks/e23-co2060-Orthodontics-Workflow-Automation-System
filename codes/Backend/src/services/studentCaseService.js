const { findOne, insert, query, update } = require('../config/database');

const CASE_STATUSES = ['ASSIGNED', 'PENDING_VERIFICATION', 'VERIFIED', 'REJECTED'];
const TASK_STATUSES = ['ASSIGNED', 'IN_PROGRESS', 'COMPLETED', 'REVIEWED'];

const normalizeCaseStatus = (value, fallback = 'ASSIGNED') => {
  const normalized = String(value || fallback).toUpperCase();
  return CASE_STATUSES.includes(normalized) ? normalized : fallback;
};

const normalizeTaskStatus = (value, fallback = 'ASSIGNED') => {
  const normalized = String(value || fallback).toUpperCase();
  return TASK_STATUSES.includes(normalized) ? normalized : fallback;
};

const toBoundedProgress = (value, fallback = null) => {
  if (value === undefined || value === null || value === '') return fallback;
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return fallback;
  return Math.min(100, Math.max(0, Math.round(numeric)));
};

const logCaseEvent = async ({
  caseId,
  patientId,
  actorId,
  actorRole,
  logType,
  title,
  entryText = null,
  progressPercentage = null,
  evaluation = null,
  recommendations = null,
  statusFrom = null,
  statusTo = null,
  metadata = null
}) => {
  return insert('case_progress_logs', {
    case_id: Number(caseId),
    patient_id: Number(patientId),
    actor_id: Number(actorId),
    actor_role: String(actorRole || '').toUpperCase(),
    log_type: logType,
    title,
    entry_text: entryText,
    progress_percentage: progressPercentage,
    evaluation,
    recommendations,
    status_from: statusFrom,
    status_to: statusTo,
    metadata: metadata ? JSON.stringify(metadata) : null
  });
};

const ensureStudentCaseForAssignment = async ({
  patientId,
  studentId,
  supervisorId,
  supervisorRole = 'ORTHODONTIST',
  assignedBy
}) => {
  const existing = await query(
    `SELECT *
     FROM cases
     WHERE patient_id = ?
       AND student_id = ?
       AND supervisor_id = ?
     ORDER BY id DESC
     LIMIT 1`,
    [patientId, studentId, supervisorId]
  );

  if (existing.length) {
    const activeCase = existing[0];
    const updates = {};

    if (!activeCase.assigned_by && assignedBy) {
      updates.assigned_by = Number(assignedBy);
    }
    if (activeCase.status === 'REJECTED') {
      updates.status = 'ASSIGNED';
    }

    if (Object.keys(updates).length) {
      await update('cases', updates, { id: activeCase.id });
    }

    return { caseId: Number(activeCase.id), created: false };
  }

  const caseId = await insert('cases', {
    patient_id: Number(patientId),
    student_id: Number(studentId),
    supervisor_id: Number(supervisorId),
    assigned_by: assignedBy ? Number(assignedBy) : null,
    status: 'ASSIGNED',
    progress_percentage: 0
  });

  await logCaseEvent({
    caseId,
    patientId,
    actorId: assignedBy || supervisorId,
    actorRole: supervisorRole,
    logType: 'ASSIGNED',
    title: 'Patient assigned to student',
    statusTo: 'ASSIGNED',
    metadata: {
      student_id: Number(studentId),
      supervisor_id: Number(supervisorId)
    }
  });

  return { caseId, created: true };
};

const getCaseByIdWithRelations = async (caseId) => {
  const rows = await query(
    `SELECT
       c.*,
       p.patient_code,
       CONCAT(p.first_name, ' ', p.last_name) AS patient_name,
       p.date_of_birth AS patient_dob,
       p.gender AS patient_gender,
       student.name AS student_name,
       student.email AS student_email,
       supervisor.name AS supervisor_name,
       supervisor.email AS supervisor_email,
       verifier.name AS verifier_name
     FROM cases c
     INNER JOIN patients p ON p.id = c.patient_id
     INNER JOIN users student ON student.id = c.student_id
     INNER JOIN users supervisor ON supervisor.id = c.supervisor_id
     LEFT JOIN users verifier ON verifier.id = c.verified_by
     WHERE c.id = ?
     LIMIT 1`,
    [caseId]
  );

  return rows[0] || null;
};

const hasActiveAssignmentForCaseUser = async (caseRow, user) => {
  if (!caseRow || !user) return false;
  if (user.role === 'ADMIN') return true;

  let assignmentRole = null;
  let ownerId = null;

  if (user.role === 'STUDENT' && Number(caseRow.student_id) === Number(user.id)) {
    assignmentRole = 'STUDENT';
    ownerId = Number(caseRow.student_id);
  } else if (['ORTHODONTIST', 'DENTAL_SURGEON'].includes(user.role) && Number(caseRow.supervisor_id) === Number(user.id)) {
    assignmentRole = user.role;
    ownerId = Number(caseRow.supervisor_id);
  } else {
    return false;
  }

  const assignment = await findOne('patient_assignments', {
    patient_id: Number(caseRow.patient_id),
    user_id: ownerId,
    assignment_role: assignmentRole,
    active: true
  });

  return Boolean(assignment);
};

const getTaskSummarySelect = () => `
  COALESCE(task_summary.total_tasks, 0) AS total_tasks,
  COALESCE(task_summary.completed_tasks, 0) AS completed_tasks,
  COALESCE(task_summary.reviewed_tasks, 0) AS reviewed_tasks,
  COALESCE(task_summary.pending_tasks, 0) AS pending_tasks,
  COALESCE(task_summary.overdue_tasks, 0) AS overdue_tasks,
  COALESCE(task_summary.progress_percentage, 0) AS progress_percentage,
  task_summary.last_task_update_at AS last_task_update_at
`;

const getTaskSummaryJoin = () => `
  LEFT JOIN (
    SELECT
      ct.case_id,
      COUNT(*) AS total_tasks,
      SUM(CASE WHEN ct.status IN ('COMPLETED', 'REVIEWED') THEN 1 ELSE 0 END) AS completed_tasks,
      SUM(CASE WHEN ct.status = 'REVIEWED' THEN 1 ELSE 0 END) AS reviewed_tasks,
      SUM(CASE WHEN ct.status IN ('ASSIGNED', 'IN_PROGRESS') THEN 1 ELSE 0 END) AS pending_tasks,
      SUM(
        CASE
          WHEN ct.deadline_at IS NOT NULL
           AND ct.status IN ('ASSIGNED', 'IN_PROGRESS')
           AND ct.deadline_at < NOW()
          THEN 1 ELSE 0
        END
      ) AS overdue_tasks,
      ROUND(
        (
          SUM(CASE WHEN ct.status IN ('COMPLETED', 'REVIEWED') THEN 1 ELSE 0 END) /
          NULLIF(COUNT(*), 0)
        ) * 100,
        0
      ) AS progress_percentage,
      MAX(ct.updated_at) AS last_task_update_at
    FROM case_tasks ct
    GROUP BY ct.case_id
  ) task_summary ON task_summary.case_id = c.id
`;

const getCaseTasks = async (caseId) => {
  const rows = await query(
    `SELECT
       ct.*,
       creator.name AS created_by_name,
       reviewer.name AS reviewed_by_name
     FROM case_tasks ct
     INNER JOIN users creator ON creator.id = ct.created_by
     LEFT JOIN users reviewer ON reviewer.id = ct.reviewed_by
     WHERE ct.case_id = ?
     ORDER BY
       CASE WHEN ct.deadline_at IS NULL THEN 1 ELSE 0 END,
       ct.deadline_at ASC,
       ct.created_at ASC,
       ct.id ASC`,
    [caseId]
  );

  return rows.map((row) => {
    const isOverdue = Boolean(
      row.deadline_at &&
      ['ASSIGNED', 'IN_PROGRESS'].includes(String(row.status || '').toUpperCase()) &&
      new Date(row.deadline_at).getTime() < Date.now()
    );

    return {
      ...row,
      is_overdue: isOverdue
    };
  });
};

module.exports = {
  CASE_STATUSES,
  TASK_STATUSES,
  normalizeCaseStatus,
  normalizeTaskStatus,
  toBoundedProgress,
  logCaseEvent,
  ensureStudentCaseForAssignment,
  getCaseByIdWithRelations,
  hasActiveAssignmentForCaseUser,
  getTaskSummarySelect,
  getTaskSummaryJoin,
  getCaseTasks
};
