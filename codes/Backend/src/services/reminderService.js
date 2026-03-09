const { query } = require('../config/database');
const { logAuditEvent } = require('../middleware/errorHandler');
const { sendAppointmentReminderEmail } = require('./emailService');

const AUTO_SCAN_INTERVAL_MS = Number(process.env.REMINDER_AUTO_SCAN_MS || 10000);
const AUTO_WINDOW_HOURS = Number(process.env.REMINDER_AUTO_WINDOW_HOURS || 48);
const MAX_CONCURRENT_JOBS = Number(process.env.REMINDER_MAX_CONCURRENT || 3);

let autoReminderInterval = null;
const queue = [];
const queuedVisitIds = new Set();
let activeJobs = 0;

const canAudit = (userId) => Number.isInteger(userId) && userId > 0;

const getVisitForReminder = async (visitId) => {
  const rows = await query(
    `SELECT v.id, v.patient_id, v.visit_date, v.procedure_type, v.status, v.reminder_sent_at,
            p.first_name, p.last_name, p.email AS patient_email
     FROM visits v
     JOIN patients p ON p.id = v.patient_id
     WHERE v.id = ? AND p.deleted_at IS NULL
     LIMIT 1`,
    [visitId]
  );
  return rows[0] || null;
};

const enqueueReminder = ({ visit, initiatedBy, source }) => {
  if (!visit?.id || queuedVisitIds.has(visit.id)) return false;
  queue.push({ visit, initiatedBy, source });
  queuedVisitIds.add(visit.id);
  processQueue();
  return true;
};

const processQueue = () => {
  while (activeJobs < MAX_CONCURRENT_JOBS && queue.length > 0) {
    const job = queue.shift();
    activeJobs += 1;
    void sendReminderJob(job).finally(() => {
      activeJobs -= 1;
      processQueue();
    });
  }
};

const sendReminderJob = async ({ visit, initiatedBy, source }) => {
  try {
    const latestRows = await query(
      `SELECT v.id, v.patient_id, v.visit_date, v.procedure_type, v.status, v.reminder_sent_at,
              p.first_name, p.last_name, p.email AS patient_email
       FROM visits v
       JOIN patients p ON p.id = v.patient_id
       WHERE v.id = ? AND p.deleted_at IS NULL
       LIMIT 1`,
      [visit.id]
    );
    const current = latestRows[0];
    if (!current || current.status !== 'SCHEDULED' || !current.patient_email || current.reminder_sent_at) {
      return;
    }

    const patientName = `${current.first_name} ${current.last_name}`;
    const result = await sendAppointmentReminderEmail({
      to: current.patient_email,
      patientName,
      visitDate: current.visit_date,
      procedureType: current.procedure_type
    });

    await query(
      `UPDATE visits
       SET reminder_sent_at = CURRENT_TIMESTAMP,
           reminder_source = ?
       WHERE id = ?
         AND reminder_sent_at IS NULL`,
      [source, current.id]
    );

    if (canAudit(initiatedBy)) {
      await logAuditEvent(initiatedBy, 'SEND_REMINDER', 'VISIT', current.id, null, {
        patient_id: current.patient_id,
        email: current.patient_email,
        simulated: result.simulated,
        source
      });
    }
  } catch (error) {
    console.error(`Reminder job failed for visit ${visit?.id}:`, error.message);
  } finally {
    if (visit?.id) {
      queuedVisitIds.delete(visit.id);
    }
  }
};

const sendManualReminder = async ({ visitId, initiatedBy }) => {
  const visit = await getVisitForReminder(visitId);
  if (!visit) return { ok: false, status: 404, message: 'Visit not found' };
  if (visit.status !== 'SCHEDULED') {
    return { ok: false, status: 400, message: 'Reminders can only be sent for scheduled appointments' };
  }
  if (!visit.patient_email) return { ok: false, status: 400, message: 'Patient has no email on record' };
  if (visit.reminder_sent_at) {
    return { ok: true, sent: false, already_sent: true, visit };
  }

  const patientName = `${visit.first_name} ${visit.last_name}`;
  const result = await sendAppointmentReminderEmail({
    to: visit.patient_email,
    patientName,
    visitDate: visit.visit_date,
    procedureType: visit.procedure_type
  });

  await query(
    `UPDATE visits
     SET reminder_sent_at = CURRENT_TIMESTAMP,
         reminder_source = 'MANUAL'
     WHERE id = ?
       AND reminder_sent_at IS NULL`,
    [visit.id]
  );

  if (canAudit(initiatedBy)) {
    await logAuditEvent(initiatedBy, 'SEND_REMINDER', 'VISIT', visit.id, null, {
      patient_id: visit.patient_id,
      email: visit.patient_email,
      simulated: result.simulated,
      source: 'MANUAL'
    });
  }

  return {
    ok: true,
    sent: result.sent,
    simulated: !!result.simulated,
    messageId: result.messageId || null,
    already_sent: false,
    visit
  };
};

const queueAutoReminders = async () => {
  try {
    const rows = await query(
      `SELECT v.id, v.patient_id, v.visit_date, v.procedure_type, v.status,
              p.first_name, p.last_name, p.email AS patient_email
       FROM visits v
       JOIN patients p ON p.id = v.patient_id
       WHERE v.status = 'SCHEDULED'
         AND v.reminder_sent_at IS NULL
         AND p.deleted_at IS NULL
         AND p.email IS NOT NULL
         AND TRIM(p.email) <> ''
         AND v.visit_date > NOW()
         AND v.visit_date <= DATE_ADD(NOW(), INTERVAL ? HOUR)
       ORDER BY v.visit_date ASC
       LIMIT 100`,
      [AUTO_WINDOW_HOURS]
    );

    for (const visit of rows) {
      enqueueReminder({ visit, initiatedBy: null, source: 'AUTO' });
    }
  } catch (error) {
    console.error('Auto reminder scan failed:', error.message);
  }
};

const startAutoReminderJob = () => {
  if (autoReminderInterval) return;
  autoReminderInterval = setInterval(() => {
    void queueAutoReminders();
  }, AUTO_SCAN_INTERVAL_MS);
  void queueAutoReminders();
  console.log(`⏰ Auto reminder job started (interval=${AUTO_SCAN_INTERVAL_MS}ms, window=${AUTO_WINDOW_HOURS}h)`);
};

const stopAutoReminderJob = () => {
  if (!autoReminderInterval) return;
  clearInterval(autoReminderInterval);
  autoReminderInterval = null;
};

module.exports = {
  sendManualReminder,
  startAutoReminderJob,
  stopAutoReminderJob
};
