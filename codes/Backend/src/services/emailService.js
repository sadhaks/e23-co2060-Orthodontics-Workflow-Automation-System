const nodemailer = require('nodemailer');

const hasSmtpConfig = () =>
  Boolean(
    process.env.SMTP_HOST &&
      process.env.SMTP_PORT &&
      process.env.SMTP_USER &&
      process.env.SMTP_PASS
  );

const isSimulationEnabled = () => String(process.env.EMAIL_SIMULATION || 'true').toLowerCase() === 'true';

const buildTransport = () => {
  if (!hasSmtpConfig()) {
    return null;
  }

  return nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT),
    secure: String(process.env.SMTP_SECURE || 'false').toLowerCase() === 'true',
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS
    }
  });
};

const formatReminderDateTime = (visitDate) => {
  const raw = String(visitDate || '').trim();

  // Preferred: preserve DB/local datetime strings without timezone conversion.
  // Supports:
  // - YYYY-MM-DD HH:mm[:ss]
  // - YYYY-MM-DDTHH:mm[:ss]
  const direct = raw.match(
    /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})(?::\d{2})?$/
  );
  if (direct) {
    const [, year, month, day, hour, minute] = direct;
    return `${year}/${month}/${day}, ${hour}:${minute}`;
  }

  // Fallback for unexpected inputs.
  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) {
    return raw;
  }
  const year = parsed.getFullYear();
  const month = String(parsed.getMonth() + 1).padStart(2, '0');
  const day = String(parsed.getDate()).padStart(2, '0');
  const hour = String(parsed.getHours()).padStart(2, '0');
  const minute = String(parsed.getMinutes()).padStart(2, '0');
  return `${year}/${month}/${day}, ${hour}:${minute}`;
};

const sendAppointmentReminderEmail = async ({
  to,
  patientName,
  visitDate,
  procedureType,
  clinicName = 'University Dental Hospital'
}) => {
  const transport = buildTransport();
  const formattedDate = formatReminderDateTime(visitDate);
  const subject = `${clinicName} Appointment Reminder`;
  const text = `Dear ${patientName}, this is a reminder for your appointment on ${formattedDate}. Visit type: ${procedureType || 'Clinic visit'}.\nUniversity Dental Hospital\nPeradeniya`;
  const html = `
    <p>Dear ${patientName},</p>
    <p>This is a reminder for your appointment on <strong>${formattedDate}</strong>.</p>
    <p>Visit type: <strong>${procedureType || 'Clinic visit'}</strong></p>
    <p>University Dental Hospital<br/>Peradeniya</p>
  `;

  if (!transport) {
    if (!isSimulationEnabled()) {
      throw new Error('SMTP is not configured. Set SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, and SMTP_FROM.');
    }
    console.log(`[EMAIL_REMINDER_SIMULATED] to=${to} subject="${subject}" body="${text}"`);
    return { sent: false, simulated: true };
  }

  const mailResult = await transport.sendMail({
    from: process.env.SMTP_FROM || process.env.SMTP_USER,
    to,
    subject,
    text,
    html
  });

  return { sent: true, simulated: false, messageId: mailResult.messageId };
};

const sendInitialPasswordEmail = async ({
  to,
  name,
  temporaryPassword,
  isReset = false,
  appName = 'OrthoFlow'
}) => {
  const transport = buildTransport();
  const subject = isReset
    ? `${appName} password reset`
    : `${appName} account created - temporary password`;
  const text = isReset
    ? `Hello ${name}, your password has been reset. Temporary password: ${temporaryPassword}. Please sign in and change it immediately.`
    : `Hello ${name}, your ${appName} account is ready. Temporary password: ${temporaryPassword}. Please sign in and change it immediately.`;
  const html = isReset
    ? `
      <p>Hello ${name},</p>
      <p>Your password has been reset by an administrator.</p>
      <p><strong>Temporary password:</strong> ${temporaryPassword}</p>
      <p>Please sign in and change your password immediately.</p>
    `
    : `
      <p>Hello ${name},</p>
      <p>Your ${appName} account has been created.</p>
      <p><strong>Temporary password:</strong> ${temporaryPassword}</p>
      <p>Please sign in and change your password immediately.</p>
    `;

  if (!transport) {
    if (!isSimulationEnabled()) {
      throw new Error('SMTP is not configured. Set SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, and SMTP_FROM.');
    }
    const mode = isReset ? 'EMAIL_PASSWORD_RESET_SIMULATED' : 'EMAIL_INITIAL_PASSWORD_SIMULATED';
    console.log(`[${mode}] to=${to} subject="${subject}" body="${text}"`);
    return { sent: false, simulated: true };
  }

  const mailResult = await transport.sendMail({
    from: process.env.SMTP_FROM || process.env.SMTP_USER,
    to,
    subject,
    text,
    html
  });

  return { sent: true, simulated: false, messageId: mailResult.messageId };
};

module.exports = {
  sendAppointmentReminderEmail,
  sendInitialPasswordEmail
};
