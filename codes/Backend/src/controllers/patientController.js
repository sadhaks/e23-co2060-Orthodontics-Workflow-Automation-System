const { 
  findOne, 
  insert, 
  update, 
  remove, 
  query
} = require('../config/database');
const { logAuditEvent } = require('../middleware/errorHandler');
const { hasPermission, OBJECT_TYPES, PERMISSIONS } = require('../middleware/accessControl');

const ASSIGNMENT_SCOPED_ROLES = new Set(['ORTHODONTIST', 'DENTAL_SURGEON', 'STUDENT']);
const APPROVAL_REQUIRED_ASSIGNMENT_ROLES = new Set(['ORTHODONTIST', 'DENTAL_SURGEON']);

const SORT_FIELD_MAP = {
  id: 'p.id',
  created_at: 'p.created_at',
  updated_at: 'p.updated_at',
  first_name: 'p.first_name',
  last_name: 'p.last_name',
  patient_code: 'p.patient_code',
  status: 'p.status'
};

// Generate unique patient code
const generatePatientCode = async () => {
  const prefix = 'P';
  const timestamp = Date.now().toString().slice(-6);
  const random = Math.floor(Math.random() * 1000).toString().padStart(3, '0');
  return `${prefix}-${timestamp}-${random}`;
};

const dateOfBirthFromAge = (ageValue) => {
  const age = Number(ageValue);
  if (!Number.isFinite(age) || age < 0) return null;
  const dob = new Date();
  dob.setFullYear(dob.getFullYear() - Math.floor(age));
  return dob.toISOString().slice(0, 10);
};

const normalizeRegistrationDateTime = (value) => {
  if (value === undefined || value === null) return null;
  const raw = String(value).trim();
  if (!raw) return null;

  const direct = raw.match(/^(\d{4}-\d{2}-\d{2})[ T](\d{2}):(\d{2})(?::(\d{2}))?$/);
  if (direct) {
    const [, datePart, hh, mm, ss] = direct;
    return `${datePart} ${hh}:${mm}:${ss || '00'}`;
  }

  const dateOnly = raw.match(/^(\d{4}-\d{2}-\d{2})$/);
  if (dateOnly) {
    return `${dateOnly[1]} 00:00:00`;
  }

  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) return null;
  const year = parsed.getFullYear();
  const month = String(parsed.getMonth() + 1).padStart(2, '0');
  const day = String(parsed.getDate()).padStart(2, '0');
  const hour = String(parsed.getHours()).padStart(2, '0');
  const minute = String(parsed.getMinutes()).padStart(2, '0');
  const second = String(parsed.getSeconds()).padStart(2, '0');
  return `${year}-${month}-${day} ${hour}:${minute}:${second}`;
};

const normalizeDentalChartVersionRow = (row) => {
  if (!row) return null;
  let snapshotData = [];
  if (Array.isArray(row.snapshot_data)) {
    snapshotData = row.snapshot_data;
  } else if (row.snapshot_data && typeof row.snapshot_data === 'object') {
    snapshotData = row.snapshot_data;
  } else if (typeof row.snapshot_data === 'string') {
    try {
      snapshotData = JSON.parse(row.snapshot_data);
    } catch (_) {
      snapshotData = [];
    }
  }
  if (!Array.isArray(snapshotData)) {
    snapshotData = [];
  }
  return {
    ...row,
    snapshot_data: snapshotData
  };
};

const ensureAssignedOrthodontist = async (patientId, userId) => {
  const rows = await query(
    `SELECT id
     FROM patient_assignments
     WHERE patient_id = ?
       AND user_id = ?
       AND assignment_role = 'ORTHODONTIST'
       AND active = TRUE
     LIMIT 1`,
    [patientId, userId]
  );
  return rows.length > 0;
};

const sanitizePdfText = (value) =>
  String(value ?? '')
    .replace(/[^\x20-\x7E]/g, ' ')
    .replace(/\\/g, '\\\\')
    .replace(/\(/g, '\\(')
    .replace(/\)/g, '\\)');

const escapeHtml = (value) =>
  String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

const wrapLine = (text, maxLen = 105) => {
  const raw = String(text || '');
  if (raw.length <= maxLen) return [raw];
  const words = raw.split(/\s+/).filter(Boolean);
  if (words.length === 0) return [''];

  const lines = [];
  let current = words[0];
  for (let i = 1; i < words.length; i += 1) {
    const next = words[i];
    if ((current + ' ' + next).length <= maxLen) {
      current += ` ${next}`;
    } else {
      lines.push(current);
      current = next;
    }
  }
  lines.push(current);
  return lines;
};

const buildPdfFromLines = (lines) => {
  const pageWidth = 595;
  const pageHeight = 842;
  const marginX = 40;
  const marginTop = 50;
  const lineHeight = 14;
  const linesPerPage = Math.max(1, Math.floor((pageHeight - marginTop - 40) / lineHeight));
  const pages = [];
  for (let i = 0; i < lines.length; i += linesPerPage) {
    pages.push(lines.slice(i, i + linesPerPage));
  }
  if (pages.length === 0) pages.push(['']);

  const objectBodies = [];
  objectBodies.push('<< /Type /Catalog /Pages 2 0 R >>');

  const pageObjectStart = 3;
  const contentObjectStart = pageObjectStart + pages.length;
  const fontObjectNumber = contentObjectStart + pages.length;
  const pageKids = pages.map((_, idx) => `${pageObjectStart + idx} 0 R`).join(' ');
  objectBodies.push(`<< /Type /Pages /Count ${pages.length} /Kids [${pageKids}] >>`);

  pages.forEach((pageLines, idx) => {
    const pageObjectNumber = pageObjectStart + idx;
    const contentObjectNumber = contentObjectStart + idx;

    objectBodies[pageObjectNumber - 1] = `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pageWidth} ${pageHeight}] /Resources << /Font << /F1 ${fontObjectNumber} 0 R >> >> /Contents ${contentObjectNumber} 0 R >>`;

    const startY = pageHeight - marginTop;
    const textLines = pageLines.map((line) => `(${sanitizePdfText(line)}) Tj`).join('\nT*\n');
    const stream = `BT
/F1 10 Tf
${lineHeight} TL
1 0 0 1 ${marginX} ${startY} Tm
${textLines}
ET`;
    const streamLength = Buffer.byteLength(stream, 'utf8');
    objectBodies[contentObjectNumber - 1] = `<< /Length ${streamLength} >>
stream
${stream}
endstream`;
  });

  objectBodies[fontObjectNumber - 1] = '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>';

  let pdf = '%PDF-1.4\n';
  const offsets = [0];
  for (let i = 0; i < objectBodies.length; i += 1) {
    offsets.push(Buffer.byteLength(pdf, 'utf8'));
    pdf += `${i + 1} 0 obj\n${objectBodies[i]}\nendobj\n`;
  }

  const xrefOffset = Buffer.byteLength(pdf, 'utf8');
  pdf += `xref
0 ${objectBodies.length + 1}
0000000000 65535 f \n`;
  for (let i = 1; i <= objectBodies.length; i += 1) {
    pdf += `${String(offsets[i]).padStart(10, '0')} 00000 n \n`;
  }
  pdf += `trailer
<< /Size ${objectBodies.length + 1} /Root 1 0 R >>
startxref
${xrefOffset}
%%EOF`;

  return Buffer.from(pdf, 'utf8');
};

const buildDentalChartVersionPdf = ({ patient, version }) => {
  const patientName = `${patient.first_name || ''} ${patient.last_name || ''}`.trim() || 'Unknown';
  const lines = [];
  lines.push('Orthodontics Workflow System - Dental Chart Version');
  lines.push('');
  lines.push(`Patient ID: ${patient.id}`);
  lines.push(`Patient Code: ${patient.patient_code || 'N/A'}`);
  lines.push(`Patient Name: ${patientName}`);
  lines.push(`Version: ${version.version_label || 'Annotated Chart Version'}`);
  lines.push(`Annotated By: ${version.annotated_by_name || 'Unknown'} (User ID: ${version.annotated_by || 'N/A'})`);
  lines.push(`Saved At: ${version.created_at ? String(version.created_at).slice(0, 19).replace('T', ' ') : 'N/A'}`);
  lines.push(`Entry Count: ${version.entry_count || 0}`);
  lines.push('');
  lines.push('Annotated Teeth');
  lines.push('----------------------------------------------------------------------------------------------------');

  const rows = Array.isArray(version.snapshot_data) ? version.snapshot_data : [];
  if (rows.length === 0) {
    lines.push('No teeth were selected in this saved version.');
  } else {
    rows.forEach((row, index) => {
      const flags = [
        row.is_pathology ? 'Pathology' : null,
        row.is_planned ? 'Planned' : null,
        row.is_treated ? 'Treated' : null,
        row.is_missing ? 'Missing' : null
      ].filter(Boolean).join(', ') || 'Healthy';

      lines.push(`${index + 1}. Tooth ${row.tooth_code || '-'} (${row.dentition || '-'} ${row.notation_x || '-'}/${row.notation_y || '-'})`);
      lines.push(`   Status: ${row.status || 'HEALTHY'} | Flags: ${flags}`);
      lines.push(`   Pathology: ${row.pathology || '-'}`);
      lines.push(`   Treatment: ${row.treatment || '-'}`);
      lines.push(`   Annotated Date: ${row.event_date ? String(row.event_date).slice(0, 19).replace('T', ' ') : '-'}`);
      lines.push('');
    });
  }

  const wrapped = lines.flatMap((line) => wrapLine(line));
  return buildPdfFromLines(wrapped);
};

const getToothVisualClass = (row) => {
  if (row?.is_missing) return 'tooth missing';
  if (row?.is_pathology) return 'tooth pathology';
  if (row?.is_planned) return 'tooth planned';
  if (row?.is_treated) return 'tooth treated';
  return 'tooth healthy';
};

const buildDentalChartVersionHtml = ({ patient, version }) => {
  const patientName = `${patient.first_name || ''} ${patient.last_name || ''}`.trim() || 'Unknown';
  const entries = Array.isArray(version.snapshot_data) ? version.snapshot_data : [];
  const createdAt = version.created_at ? String(version.created_at).slice(0, 19).replace('T', ' ') : 'N/A';

  const cards = entries.length
    ? entries.map((row) => {
      const flags = [
        row.is_pathology ? 'Pathology' : null,
        row.is_planned ? 'Planned' : null,
        row.is_treated ? 'Treated' : null,
        row.is_missing ? 'Missing' : null
      ].filter(Boolean).join(' • ') || 'Healthy';
      return `
      <div class="${getToothVisualClass(row)}">
        <div class="notation"><span class="x">${escapeHtml(row.notation_x || '-')}</span><span class="slash">/</span><span class="y">${escapeHtml(row.notation_y || '-')}</span></div>
        <div class="tooth-icon">🦷</div>
        <div class="meta">Tooth: ${escapeHtml(row.tooth_code || '-')}</div>
        <div class="meta">Status: ${escapeHtml(row.status || 'HEALTHY')}</div>
        <div class="flags">${escapeHtml(flags)}</div>
        <div class="text">Pathology: ${escapeHtml(row.pathology || '-')}</div>
        <div class="text">Treatment: ${escapeHtml(row.treatment || '-')}</div>
        <div class="text">Annotated Date: ${escapeHtml(row.event_date ? String(row.event_date).slice(0, 19).replace('T', ' ') : '-')}</div>
      </div>`;
    }).join('')
    : '<p class="empty">No teeth were selected in this saved version.</p>';

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <title>Dental Chart Version</title>
  <style>
    * { box-sizing: border-box; }
    body { font-family: Arial, Helvetica, sans-serif; margin: 0; color: #0f172a; background: #f8fafc; }
    .page { padding: 24px; }
    .header { border: 1px solid #cbd5e1; border-radius: 14px; padding: 16px; background: #fff; margin-bottom: 16px; }
    .title { font-size: 20px; font-weight: 800; margin: 0 0 8px; }
    .sub { font-size: 12px; color: #475569; line-height: 1.45; }
    .legend { display: flex; gap: 10px; flex-wrap: wrap; margin-top: 12px; font-size: 11px; }
    .dot { width: 10px; height: 10px; border-radius: 999px; display: inline-block; margin-right: 4px; vertical-align: middle; }
    .d-pathology { background: #ef4444; }
    .d-planned { background: #3b82f6; }
    .d-treated { background: #22c55e; }
    .d-missing { background: #94a3b8; }
    .d-healthy { background: #64748b; }
    .grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 12px; }
    .tooth { border-radius: 14px; padding: 10px; background: #ffffff; border: 2px solid #94a3b8; min-height: 152px; }
    .tooth.pathology { border-color: #ef4444; background: #fef2f2; }
    .tooth.planned { border-color: #3b82f6; background: #eff6ff; }
    .tooth.treated { border-color: #22c55e; background: #f0fdf4; }
    .tooth.missing { border-color: #64748b; border-style: dashed; background: #f8fafc; }
    .tooth.healthy { border-color: #cbd5e1; background: #ffffff; }
    .notation { font-weight: 800; font-size: 16px; margin-bottom: 4px; }
    .notation .x { color: #2563eb; }
    .notation .slash { color: #94a3b8; margin: 0 2px; }
    .notation .y { color: #047857; }
    .tooth-icon { font-size: 30px; line-height: 1; margin-bottom: 4px; }
    .meta { font-size: 11px; color: #0f172a; margin-bottom: 2px; }
    .flags { font-size: 11px; color: #1d4ed8; margin-bottom: 4px; font-weight: 700; }
    .text { font-size: 10px; color: #334155; line-height: 1.3; }
    .empty { font-size: 12px; color: #475569; margin: 8px 0 0; }
  </style>
</head>
<body>
  <div class="page">
    <section class="header">
      <h1 class="title">Dental Chart Version Report</h1>
      <div class="sub">Patient: ${escapeHtml(patientName)} (${escapeHtml(patient.patient_code || 'N/A')})</div>
      <div class="sub">Version: ${escapeHtml(version.version_label || 'Annotated Chart Version')}</div>
      <div class="sub">Annotated By: ${escapeHtml(version.annotated_by_name || 'Unknown')} (User ID: ${escapeHtml(version.annotated_by || 'N/A')})</div>
      <div class="sub">Saved At: ${escapeHtml(createdAt)} | Entry Count: ${escapeHtml(version.entry_count || 0)}</div>
      <div class="legend">
        <span><span class="dot d-pathology"></span>Pathology</span>
        <span><span class="dot d-planned"></span>Planned</span>
        <span><span class="dot d-treated"></span>Treated</span>
        <span><span class="dot d-missing"></span>Missing</span>
        <span><span class="dot d-healthy"></span>Healthy</span>
      </div>
    </section>
    <section class="grid">
      ${cards}
    </section>
  </div>
</body>
</html>`;
};

const buildDentalChartVersionVisualPdf = async ({ patient, version }) => {
  // Optional dependency. If unavailable in deployment, caller should fallback.
  const { chromium } = require('playwright');
  const browser = await chromium.launch({ headless: true, args: ['--no-sandbox', '--disable-setuid-sandbox'] });
  try {
    const page = await browser.newPage();
    const html = buildDentalChartVersionHtml({ patient, version });
    await page.setContent(html, { waitUntil: 'networkidle' });
    return await page.pdf({
      format: 'A4',
      printBackground: true,
      margin: { top: '10mm', right: '8mm', bottom: '10mm', left: '8mm' }
    });
  } finally {
    await browser.close();
  }
};

// Get all patients with pagination and filtering
const getPatients = async (req, res) => {
  try {
    const { 
      page = 1, 
      limit = 10, 
      search, 
      status, 
      gender,
      deleted = 'active',
      sort = 'id',
      order = 'DESC'
    } = req.query;

    const parsedPage = parseInt(page, 10);
    const parsedLimit = parseInt(limit, 10);
    const offset = (parsedPage - 1) * parsedLimit;
    const normalizedOrder = String(order).toUpperCase() === 'ASC' ? 'ASC' : 'DESC';
    const sortField = SORT_FIELD_MAP[sort] || SORT_FIELD_MAP.id;

    const deletedMode = String(deleted || 'active').toLowerCase();
    if ((deletedMode === 'inactive' || deletedMode === 'all') && req.user.role !== 'ADMIN') {
      return res.status(403).json({
        success: false,
        message: 'Only admin can view inactive patients'
      });
    }
    const whereClauses = [];
    const whereValues = [];

    if (deletedMode === 'inactive') {
      whereClauses.push('p.deleted_at IS NOT NULL');
    } else if (deletedMode === 'all') {
      // no deleted_at filter
    } else {
      whereClauses.push('p.deleted_at IS NULL');
    }

    if (status) {
      whereClauses.push('p.status = ?');
      whereValues.push(status);
    }
    if (gender) {
      whereClauses.push('p.gender = ?');
      whereValues.push(gender);
    }
    if (search) {
      const searchTerm = `%${search}%`;
      const normalizedSearch = String(search).toLowerCase().replace(/[^a-z0-9]/g, '');
      const normalizedSearchTerm = `%${normalizedSearch}%`;
      whereClauses.push(`(
        p.first_name LIKE ?
        OR p.last_name LIKE ?
        OR p.patient_code LIKE ?
        OR CONCAT(p.first_name, ' ', p.last_name) LIKE ?
        OR LOWER(
          REPLACE(
            REPLACE(
              REPLACE(
                REPLACE(CONCAT(COALESCE(p.first_name, ''), COALESCE(p.last_name, '')), ' ', ''),
                '.',
                ''
              ),
              '-',
              ''
            ),
            '_',
            ''
          )
        ) LIKE ?
      )`);
      whereValues.push(searchTerm, searchTerm, searchTerm, searchTerm, normalizedSearchTerm);
    }

    const assignedOrthodontist = String(req.query.assigned_orthodontist || '').trim();
    if (assignedOrthodontist) {
      if (assignedOrthodontist === 'unassigned') {
        whereClauses.push(`
          NOT EXISTS (
            SELECT 1
            FROM patient_assignments pa_ortho_none
            WHERE pa_ortho_none.patient_id = p.id
              AND pa_ortho_none.assignment_role = 'ORTHODONTIST'
              AND pa_ortho_none.active = TRUE
            LIMIT 1
          )
        `);
      } else if (/^\d+$/.test(assignedOrthodontist)) {
        whereClauses.push(`
          EXISTS (
            SELECT 1
            FROM patient_assignments pa_ortho
            WHERE pa_ortho.patient_id = p.id
              AND pa_ortho.assignment_role = 'ORTHODONTIST'
              AND pa_ortho.active = TRUE
              AND pa_ortho.user_id = ?
            LIMIT 1
          )
        `);
        whereValues.push(Number(assignedOrthodontist));
      }
    }

    const registeredFrom = req.query.registered_from ? String(req.query.registered_from) : '';
    const registeredTo = req.query.registered_to ? String(req.query.registered_to) : '';
    if (registeredFrom && registeredTo) {
      const fromDate = new Date(registeredFrom);
      const toDate = new Date(registeredTo);
      if (!Number.isNaN(fromDate.getTime()) && !Number.isNaN(toDate.getTime()) && fromDate > toDate) {
        return res.status(400).json({
          success: false,
          message: 'registered_from cannot be later than registered_to'
        });
      }
    }
    if (registeredFrom) {
      whereClauses.push('DATE(p.created_at) >= ?');
      whereValues.push(registeredFrom);
    }
    if (registeredTo) {
      whereClauses.push('DATE(p.created_at) <= ?');
      whereValues.push(registeredTo);
    }

    if (ASSIGNMENT_SCOPED_ROLES.has(req.user.role)) {
      whereClauses.push(`
        EXISTS (
          SELECT 1
          FROM patient_assignments pa_scope
          WHERE pa_scope.patient_id = p.id
            AND pa_scope.user_id = ?
            AND pa_scope.assignment_role = ?
            AND pa_scope.active = TRUE
          LIMIT 1
        )
      `);
      whereValues.push(req.user.id, req.user.role);
    }

    const whereSql = whereClauses.length ? `WHERE ${whereClauses.join(' AND ')}` : '';

    const totalResult = await query(
      `SELECT COUNT(*) as total FROM patients p ${whereSql}`,
      whereValues
    );
    const total = totalResult[0].total;

    const patients = await query(
      `SELECT 
        p.id,
        p.patient_code,
        p.first_name,
        p.last_name,
        p.date_of_birth,
        p.gender,
        p.province,
        p.phone,
        p.email,
        p.status,
        p.deleted_at,
        (p.deleted_at IS NOT NULL) as is_inactive,
        CASE WHEN p.deleted_at IS NOT NULL THEN 'INACTIVE' ELSE p.status END as display_status,
        p.nhi_verified,
        p.created_at,
        p.updated_at,
        TIMESTAMPDIFF(YEAR, p.date_of_birth, CURDATE()) as age,
        ortho.user_names as assigned_orthodontist_name,
        surgeon.user_names as assigned_surgeon_name,
        student.user_names as assigned_student_name,
        req_status.status as assignment_request_status
      FROM patients p
      LEFT JOIN (
        SELECT pa.patient_id, GROUP_CONCAT(DISTINCT u.name ORDER BY u.name SEPARATOR ', ') as user_names
        FROM patient_assignments pa
        JOIN users u ON u.id = pa.user_id
        WHERE pa.assignment_role = 'ORTHODONTIST'
          AND pa.active = TRUE
          AND u.status = 'ACTIVE'
          AND u.role = 'ORTHODONTIST'
        GROUP BY pa.patient_id
      ) ortho ON ortho.patient_id = p.id
      LEFT JOIN (
        SELECT pa.patient_id, GROUP_CONCAT(DISTINCT u.name ORDER BY u.name SEPARATOR ', ') as user_names
        FROM patient_assignments pa
        JOIN users u ON u.id = pa.user_id
        WHERE pa.assignment_role = 'DENTAL_SURGEON'
          AND pa.active = TRUE
          AND u.status = 'ACTIVE'
          AND u.role = 'DENTAL_SURGEON'
        GROUP BY pa.patient_id
      ) surgeon ON surgeon.patient_id = p.id
      LEFT JOIN (
        SELECT pa.patient_id, GROUP_CONCAT(DISTINCT u.name ORDER BY u.name SEPARATOR ', ') as user_names
        FROM patient_assignments pa
        JOIN users u ON u.id = pa.user_id
        WHERE pa.assignment_role = 'STUDENT'
          AND pa.active = TRUE
          AND u.status = 'ACTIVE'
          AND u.role = 'STUDENT'
        GROUP BY pa.patient_id
      ) student ON student.patient_id = p.id
      LEFT JOIN (
        SELECT par.patient_id, par.status
        FROM patient_assignment_requests par
        JOIN users requester ON requester.id = par.requested_by
        WHERE requester.role = 'RECEPTION'
          AND par.id = (
            SELECT par2.id
            FROM patient_assignment_requests par2
            JOIN users requester2 ON requester2.id = par2.requested_by
            WHERE par2.patient_id = par.patient_id
              AND requester2.role = 'RECEPTION'
            ORDER BY par2.created_at DESC, par2.id DESC
            LIMIT 1
          )
      ) req_status ON req_status.patient_id = p.id
      ${whereSql}
      ORDER BY ${sortField} ${normalizedOrder}
      LIMIT ? OFFSET ?`,
      [...whereValues, parsedLimit, offset]
    );

    // Get additional stats for each patient
    const patientsWithStats = await Promise.all(
      patients.map(async (patient) => {
        const [visitCount, lastVisit] = await Promise.all([
          query('SELECT COUNT(*) as count FROM visits WHERE patient_id = ? AND status = "COMPLETED"', [patient.id]),
          query('SELECT visit_date FROM visits WHERE patient_id = ? ORDER BY visit_date DESC LIMIT 1', [patient.id])
        ]);

        return {
          ...patient,
          total_visits: visitCount[0].count,
          last_visit: lastVisit[0]?.visit_date || null
        };
      })
    );

    res.json({
      success: true,
      data: {
        patients: patientsWithStats,
        pagination: {
          current_page: parsedPage,
          total_pages: Math.ceil(total / parsedLimit),
          total_records: total,
          limit: parsedLimit
        }
      }
    });
  } catch (error) {
    console.error('Get patients error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
};

// Get single patient by ID
const getPatientById = async (req, res) => {
  try {
    const { id } = req.params;

    const patient = await findOne('patients', { id, deleted_at: null });
    
    if (!patient) {
      return res.status(404).json({
        success: false,
        message: 'Patient not found'
      });
    }

    // Get additional patient data
    const canReadDocuments = hasPermission(req.user.role, OBJECT_TYPES.PATIENT_RADIOGRAPHS, PERMISSIONS.READ);
    const canReadNotes = hasPermission(req.user.role, OBJECT_TYPES.PATIENT_NOTES, PERMISSIONS.READ);

    const [visits, documents, clinicalNotes, cases, assignments] = await Promise.all([
      query(`
        SELECT v.*, u.name as provider_name 
        FROM visits v 
        LEFT JOIN users u ON v.provider_id = u.id 
        WHERE v.patient_id = ? 
        ORDER BY v.visit_date DESC
      `, [id]),
      canReadDocuments
        ? query(`
            SELECT md.*, u.name as uploaded_by_name 
            FROM medical_documents md 
            LEFT JOIN users u ON md.uploaded_by = u.id 
            WHERE md.patient_id = ? 
            ORDER BY md.created_at DESC
          `, [id])
        : Promise.resolve([]),
      canReadNotes
        ? query(`
            SELECT cn.*, u.name as author_name, v.name as verifier_name
            FROM clinical_notes cn 
            LEFT JOIN users u ON cn.author_id = u.id 
            LEFT JOIN users v ON cn.verified_by = v.id 
            WHERE cn.patient_id = ? 
            ORDER BY cn.created_at DESC
          `, [id])
        : Promise.resolve([]),
      query(`
        SELECT c.*, 
               s.name as student_name, 
               sup.name as supervisor_name 
        FROM cases c 
        LEFT JOIN users s ON c.student_id = s.id 
        LEFT JOIN users sup ON c.supervisor_id = sup.id 
        WHERE c.patient_id = ? 
        ORDER BY c.created_at DESC
      `, [id]),
      query(
        `SELECT pa.id, pa.patient_id, pa.user_id, pa.assignment_role, pa.active, pa.created_at,
                u.name AS user_name, u.email AS user_email
         FROM patient_assignments pa
         JOIN users u ON u.id = pa.user_id
         WHERE pa.patient_id = ?
           AND pa.active = TRUE
           AND u.status = 'ACTIVE'
           AND u.role = pa.assignment_role
         ORDER BY pa.assignment_role, pa.created_at DESC`,
        [id]
      )
    ]);

    res.json({
      success: true,
      data: {
        patient: {
          ...patient,
          age: Math.floor((new Date() - new Date(patient.date_of_birth)) / (365.25 * 24 * 60 * 60 * 1000))
        },
        visits,
        documents,
        clinical_notes: clinicalNotes,
        cases,
        assignments,
        access: {
          can_read_documents: canReadDocuments,
          can_read_notes: canReadNotes,
          can_read_dental_chart: hasPermission(req.user.role, OBJECT_TYPES.PATIENT_MEDICAL, PERMISSIONS.READ)
        }
      }
    });
  } catch (error) {
    console.error('Get patient error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
};

// Create new patient
const createPatient = async (req, res) => {
  try {
    const patientData = { ...req.body };

    if (!patientData.date_of_birth && patientData.age !== undefined) {
      const derivedDob = dateOfBirthFromAge(patientData.age);
      if (!derivedDob) {
        return res.status(400).json({
          success: false,
          message: 'Invalid age provided'
        });
      }
      patientData.date_of_birth = derivedDob;
    }
    delete patientData.age;

    if (patientData.registration_date) {
      const normalizedRegDateTime = normalizeRegistrationDateTime(patientData.registration_date);
      if (!normalizedRegDateTime) {
        return res.status(400).json({
          success: false,
          message: 'Invalid registration_date provided'
        });
      }
      patientData.created_at = normalizedRegDateTime;
      delete patientData.registration_date;
    }

    // Generate unique patient code if not provided
    if (!patientData.patient_code) {
      patientData.patient_code = await generatePatientCode();
    }

    // Check if patient code already exists
    const existingPatient = await findOne('patients', { patient_code: patientData.patient_code });
    if (existingPatient) {
      return res.status(400).json({
        success: false,
        message: 'Patient code already exists'
      });
    }

    // Create patient
    const patientId = await insert('patients', patientData);

    // Record registration as first visit entry.
    const registrationVisitDate = patientData.created_at || new Date().toISOString().slice(0, 19).replace('T', ' ');
    await insert('visits', {
      patient_id: patientId,
      provider_id: req.user.id,
      visit_date: registrationVisitDate,
      procedure_type: 'REGISTRATION',
      status: 'COMPLETED',
      notes: 'Patient registration'
    });

    await logAuditEvent(req.user.id, 'CREATE', 'PATIENT', patientId, null, patientData);

    // Return created patient
    const createdPatient = await findOne('patients', { id: patientId });

    res.status(201).json({
      success: true,
      message: 'Patient created successfully',
      data: createdPatient
    });
  } catch (error) {
    console.error('Create patient error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
};

// Update patient
const updatePatient = async (req, res) => {
  try {
    const { id } = req.params;
    const updateData = { ...req.body };

    if (updateData.registration_date) {
      const normalizedRegDateTime = normalizeRegistrationDateTime(updateData.registration_date);
      if (!normalizedRegDateTime) {
        return res.status(400).json({
          success: false,
          message: 'Invalid registration_date provided'
        });
      }
      updateData.created_at = normalizedRegDateTime;
      delete updateData.registration_date;
    }

    if (!updateData.date_of_birth && updateData.age !== undefined) {
      const derivedDob = dateOfBirthFromAge(updateData.age);
      if (!derivedDob) {
        return res.status(400).json({
          success: false,
          message: 'Invalid age provided'
        });
      }
      updateData.date_of_birth = derivedDob;
    }
    delete updateData.age;

    // Check if patient exists
    const existingPatient = await findOne('patients', { id, deleted_at: null });
    if (!existingPatient) {
      return res.status(404).json({
        success: false,
        message: 'Patient not found'
      });
    }

    // If updating patient code, check for duplicates
    if (updateData.patient_code && updateData.patient_code !== existingPatient.patient_code) {
      const duplicatePatient = await findOne('patients', { patient_code: updateData.patient_code });
      if (duplicatePatient) {
        return res.status(400).json({
          success: false,
          message: 'Patient code already exists'
        });
      }
    }

    const hasRegistrationDateUpdate = Boolean(updateData.created_at);

    // Update patient
    await update('patients', updateData, { id });

    // Keep registration visit timestamp aligned with patient registration datetime.
    if (hasRegistrationDateUpdate) {
      await query(
        `UPDATE visits
         SET visit_date = ?
         WHERE patient_id = ?
           AND procedure_type = 'REGISTRATION'`,
        [updateData.created_at, id]
      );
    }

    await logAuditEvent(req.user.id, 'UPDATE', 'PATIENT', id, existingPatient, updateData);

    // Return updated patient
    const updatedPatient = await findOne('patients', { id });

    res.json({
      success: true,
      message: 'Patient updated successfully',
      data: updatedPatient
    });
  } catch (error) {
    console.error('Update patient error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
};

// Delete patient (soft delete)
const deletePatient = async (req, res) => {
  try {
    const { id } = req.params;
    const permanent = String(req.query.permanent || '').toLowerCase() === 'true';

    if (permanent) {
      const rows = await query('SELECT * FROM patients WHERE id = ? LIMIT 1', [id]);
      const existingPatient = rows[0];
      if (!existingPatient) {
        return res.status(404).json({
          success: false,
          message: 'Patient not found'
        });
      }

      if (!existingPatient.deleted_at) {
        return res.status(400).json({
          success: false,
          message: 'Patient must be inactive before permanent deletion'
        });
      }

      await remove('patients', { id }, false);

      await logAuditEvent(req.user.id, 'HARD_DELETE', 'PATIENT', id, existingPatient, null);

      return res.json({
        success: true,
        message: 'Patient permanently deleted'
      });
    }

    // Check if patient exists
    const existingPatient = await findOne('patients', { id, deleted_at: null });
    if (!existingPatient) {
      return res.status(404).json({
        success: false,
        message: 'Patient not found'
      });
    }

    // Admin can always inactivate a patient, even with active cases/upcoming visits.
    // Keep the safeguard for any future non-admin delete flows.
    if (req.user.role !== 'ADMIN') {
      const [activeCases, upcomingVisits] = await Promise.all([
        query('SELECT COUNT(*) as count FROM cases WHERE patient_id = ? AND status IN ("ASSIGNED", "PENDING_VERIFICATION")', [id]),
        query('SELECT COUNT(*) as count FROM visits WHERE patient_id = ? AND visit_date > NOW() AND status != "CANCELLED"', [id])
      ]);

      if (activeCases[0].count > 0 || upcomingVisits[0].count > 0) {
        return res.status(400).json({
          success: false,
          message: 'Cannot delete patient with active cases or upcoming visits'
        });
      }
    }

    // Soft delete patient
    await remove('patients', { id }, true);

    await logAuditEvent(req.user.id, 'DELETE', 'PATIENT', id, existingPatient, null);

    res.json({
      success: true,
      message: 'Patient set to inactive successfully'
    });
  } catch (error) {
    console.error('Delete patient error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
};

// Reactivate patient (clear inactive/deleted marker)
const reactivatePatient = async (req, res) => {
  try {
    const { id } = req.params;

    const rows = await query('SELECT * FROM patients WHERE id = ? LIMIT 1', [id]);
    const existingPatient = rows[0];
    if (!existingPatient) {
      return res.status(404).json({
        success: false,
        message: 'Patient not found'
      });
    }

    if (!existingPatient.deleted_at) {
      return res.status(400).json({
        success: false,
        message: 'Patient is already active'
      });
    }

    await update('patients', { deleted_at: null }, { id });

    await logAuditEvent(req.user.id, 'RESTORE', 'PATIENT', id, existingPatient, { deleted_at: null });

    const updatedPatient = await findOne('patients', { id });
    return res.json({
      success: true,
      message: 'Patient reactivated successfully',
      data: updatedPatient
    });
  } catch (error) {
    console.error('Reactivate patient error:', error);
    return res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
};

// Get patient statistics
const getPatientStats = async (req, res) => {
  try {
    const stats = await query(`
      SELECT 
        COUNT(*) as total_patients,
        COUNT(CASE WHEN status = 'ACTIVE' THEN 1 END) as active_patients,
        COUNT(CASE WHEN status = 'COMPLETED' THEN 1 END) as completed_patients,
        COUNT(CASE WHEN status = 'CONSULTATION' THEN 1 END) as consultation_patients,
        COUNT(CASE WHEN status = 'MAINTENANCE' THEN 1 END) as maintenance_patients,
        COUNT(CASE WHEN gender = 'MALE' THEN 1 END) as male_patients,
        COUNT(CASE WHEN gender = 'FEMALE' THEN 1 END) as female_patients,
        COUNT(CASE WHEN gender = 'OTHER' THEN 1 END) as other_gender_patients,
        AVG(TIMESTAMPDIFF(YEAR, date_of_birth, CURDATE())) as average_age
      FROM patients 
      WHERE deleted_at IS NULL
    `);

    // Monthly new patients (last 12 months)
    const monthlyStats = await query(`
      SELECT 
        DATE_FORMAT(created_at, '%Y-%m') as month,
        COUNT(*) as new_patients
      FROM patients 
      WHERE deleted_at IS NULL 
        AND created_at >= DATE_SUB(NOW(), INTERVAL 12 MONTH)
      GROUP BY DATE_FORMAT(created_at, '%Y-%m')
      ORDER BY month ASC
    `);

    res.json({
      success: true,
      data: {
        overview: stats[0],
        monthly_new_patients: monthlyStats
      }
    });
  } catch (error) {
    console.error('Get patient stats error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
};

const getActiveOrthodontists = async (req, res) => {
  try {
    const orthodontists = await query(
      `SELECT id, name, email
       FROM users
       WHERE role = 'ORTHODONTIST' AND status = 'ACTIVE'
       ORDER BY name ASC`
    );

    res.json({
      success: true,
      data: orthodontists
    });
  } catch (error) {
    console.error('Get active orthodontists error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
};

const getAssignableStaff = async (req, res) => {
  try {
    const rawRoles = String(req.query.roles || '').trim();
    const requestedRoles = rawRoles
      ? rawRoles.split(',').map((r) => r.trim().toUpperCase()).filter(Boolean)
      : [];

    if (req.user.role === 'ORTHODONTIST') {
      // Orthodontists can only assign surgeons/students.
      const allowedForOrtho = new Set(['DENTAL_SURGEON', 'STUDENT']);
      const effectiveRoles = requestedRoles.length
        ? requestedRoles.filter((r) => allowedForOrtho.has(r))
        : Array.from(allowedForOrtho);

      if (!effectiveRoles.length) {
        return res.json({ success: true, data: [] });
      }

      const placeholders = effectiveRoles.map(() => '?').join(', ');
      const staff = await query(
        `SELECT id, name, email, role
         FROM users
         WHERE status = 'ACTIVE'
           AND role IN (${placeholders})
         ORDER BY role ASC, name ASC`,
        effectiveRoles
      );

      return res.json({
        success: true,
        data: staff
      });
    }

    // Reception can query assignable roles used in patient directory assignment flows.
    const allowedForReception = new Set(['ORTHODONTIST', 'DENTAL_SURGEON', 'NURSE', 'STUDENT']);
    const effectiveRoles = requestedRoles.length
      ? requestedRoles.filter((r) => allowedForReception.has(r))
      : Array.from(allowedForReception);

    if (!effectiveRoles.length) {
      return res.json({ success: true, data: [] });
    }

    const placeholders = effectiveRoles.map(() => '?').join(', ');
    const staff = await query(
      `SELECT id, name, email, role
       FROM users
       WHERE status = 'ACTIVE'
         AND role IN (${placeholders})
       ORDER BY role ASC, name ASC`,
      effectiveRoles
    );

    res.json({
      success: true,
      data: staff
    });
  } catch (error) {
    console.error('Get assignable staff error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
};

// Assign a care-team member to a patient for instance-level access control
const assignPatientMember = async (req, res) => {
  try {
    const { id: patientId } = req.params;
    const syncMode = Boolean(req.body.sync);
    const assignmentsPayload = Array.isArray(req.body.assignments)
      ? req.body.assignments
      : [{ user_id: req.body.user_id, assignment_role: req.body.assignment_role }];

    const patient = await findOne('patients', { id: patientId, deleted_at: null });
    if (!patient) {
      return res.status(404).json({
        success: false,
        message: 'Patient not found'
      });
    }

    if (!syncMode && !assignmentsPayload.length) {
      return res.status(400).json({
        success: false,
        message: 'At least one assignment is required'
      });
    }

    const allowedRoles = ['ORTHODONTIST', 'DENTAL_SURGEON', 'NURSE', 'STUDENT'];
    let manageableRoles = new Set(['ORTHODONTIST', 'DENTAL_SURGEON']);

    if (req.user.role === 'ORTHODONTIST') {
      const canAssignRoles = new Set(['DENTAL_SURGEON', 'STUDENT']);
      manageableRoles = canAssignRoles;

      const scopeRows = await query(
        `SELECT 1
         FROM patient_assignments
         WHERE patient_id = ?
           AND user_id = ?
           AND assignment_role = 'ORTHODONTIST'
           AND active = TRUE
         LIMIT 1`,
        [patientId, req.user.id]
      );

      if (!scopeRows.length) {
        return res.status(403).json({
          success: false,
          message: 'You can only assign team members for your own patients'
        });
      }

      const hasInvalidRole = assignmentsPayload.some((entry) => !canAssignRoles.has(String(entry.assignment_role || '').toUpperCase()));
      if (hasInvalidRole) {
        return res.status(403).json({
          success: false,
          message: 'Orthodontists can only assign DENTAL_SURGEON or STUDENT'
        });
      }
    }

    if (req.user.role === 'RECEPTION' && syncMode) {
      const pendingRoles = Array.from(manageableRoles).filter((role) => APPROVAL_REQUIRED_ASSIGNMENT_ROLES.has(role));
      if (pendingRoles.length) {
        const placeholders = pendingRoles.map(() => '?').join(', ');
        await query(
          `DELETE FROM patient_assignment_requests
           WHERE patient_id = ?
             AND target_role IN (${placeholders})
             AND status = 'PENDING'`,
          [patientId, ...pendingRoles]
        );
      }
    }

    const created = [];
    const skipped = [];
    const removed = [];
    const pending = [];
    const desiredByRole = new Map();

    for (const rawEntry of assignmentsPayload) {
      const user_id = Number(rawEntry.user_id);
      const assignment_role = String(rawEntry.assignment_role || '').toUpperCase();

      if (!Number.isInteger(user_id) || !allowedRoles.includes(assignment_role)) {
        return res.status(400).json({
          success: false,
          message: 'Each assignment must include valid user_id and assignment_role'
        });
      }

      if (!manageableRoles.has(assignment_role)) {
        return res.status(403).json({
          success: false,
          message: `You are not allowed to assign role ${assignment_role}`
        });
      }

      const member = await findOne('users', { id: user_id, status: 'ACTIVE' });
      if (!member) {
        return res.status(400).json({
          success: false,
          message: `Assigned user ${user_id} not found or inactive`
        });
      }

      if (member.role !== assignment_role) {
        return res.status(400).json({
          success: false,
          message: `assignment_role must match selected user role (user_id=${user_id})`
        });
      }

      const alreadyAssigned = await query(
        `SELECT id
         FROM patient_assignments
         WHERE patient_id = ?
           AND user_id = ?
           AND assignment_role = ?
           AND active = TRUE
         LIMIT 1`,
        [patientId, user_id, assignment_role]
      );

      if (alreadyAssigned.length) {
        skipped.push({ user_id, assignment_role, reason: 'already_assigned' });
        if (!desiredByRole.has(assignment_role)) desiredByRole.set(assignment_role, new Set());
        desiredByRole.get(assignment_role).add(user_id);
        continue;
      }

      if (!desiredByRole.has(assignment_role)) desiredByRole.set(assignment_role, new Set());
      desiredByRole.get(assignment_role).add(user_id);
      if (req.user.role === 'RECEPTION' && APPROVAL_REQUIRED_ASSIGNMENT_ROLES.has(assignment_role)) {
        const existingPending = await query(
          `SELECT id
           FROM patient_assignment_requests
           WHERE patient_id = ?
             AND target_user_id = ?
             AND target_role = ?
             AND action_type = 'ASSIGN'
             AND status = 'PENDING'
           LIMIT 1`,
          [patientId, user_id, assignment_role]
        );

        if (!existingPending.length) {
          const requestId = await insert('patient_assignment_requests', {
            patient_id: Number(patientId),
            target_user_id: user_id,
            target_role: assignment_role,
            action_type: 'ASSIGN',
            requested_by: Number(req.user.id),
            status: 'PENDING'
          });
          pending.push({ id: requestId, user_id, assignment_role, action_type: 'ASSIGN' });
          await logAuditEvent(req.user.id, 'ASSIGN_REQUEST', 'PATIENT_ASSIGNMENT', requestId, null, {
            patient_id: Number(patientId),
            user_id,
            assignment_role
          });
        } else {
          skipped.push({ user_id, assignment_role, reason: 'already_pending_approval' });
        }
      } else {
        const assignmentId = await insert('patient_assignments', {
          patient_id: patientId,
          user_id,
          assignment_role,
          assigned_by: req.user.id,
          active: true
        });

        created.push({ id: assignmentId, user_id, assignment_role });
        await logAuditEvent(req.user.id, 'ASSIGN', 'PATIENT_ASSIGNMENT', assignmentId, null, {
          patient_id: Number(patientId),
          user_id,
          assignment_role
        });
      }
    }

    if (syncMode) {
      const scopeRoles = Array.from(manageableRoles);
      const rolePlaceholders = scopeRoles.map(() => '?').join(', ');
      const currentActive = await query(
        `SELECT id, user_id, assignment_role
         FROM patient_assignments
         WHERE patient_id = ?
           AND active = TRUE
           AND assignment_role IN (${rolePlaceholders})`,
        [patientId, ...scopeRoles]
      );

      for (const row of currentActive) {
        const role = String(row.assignment_role || '').toUpperCase();
        const desiredUsers = desiredByRole.get(role) || new Set();
        if (desiredUsers.has(Number(row.user_id))) continue;

        if (req.user.role === 'RECEPTION' && APPROVAL_REQUIRED_ASSIGNMENT_ROLES.has(role)) {
          const existingPending = await query(
            `SELECT id
             FROM patient_assignment_requests
             WHERE patient_id = ?
               AND target_user_id = ?
               AND target_role = ?
               AND action_type = 'REMOVE'
               AND status = 'PENDING'
             LIMIT 1`,
            [patientId, Number(row.user_id), role]
          );

          if (!existingPending.length) {
            const requestId = await insert('patient_assignment_requests', {
              patient_id: Number(patientId),
              target_user_id: Number(row.user_id),
              target_role: role,
              action_type: 'REMOVE',
              requested_by: Number(req.user.id),
              status: 'PENDING'
            });
            pending.push({ id: requestId, user_id: Number(row.user_id), assignment_role: role, action_type: 'REMOVE' });
            await logAuditEvent(req.user.id, 'UNASSIGN_REQUEST', 'PATIENT_ASSIGNMENT', requestId, null, {
              patient_id: Number(patientId),
              user_id: Number(row.user_id),
              assignment_role: role
            });
          } else {
            skipped.push({ user_id: Number(row.user_id), assignment_role: role, reason: 'already_pending_approval' });
          }
        } else {
          const tupleParams = [patientId, Number(row.user_id), role];
          const existingInactive = await query(
            `SELECT id
             FROM patient_assignments
             WHERE patient_id = ?
               AND user_id = ?
               AND assignment_role = ?
               AND active = FALSE
             LIMIT 1`,
            tupleParams
          );

          if (existingInactive.length) {
            await query(
              `DELETE FROM patient_assignments
               WHERE id = ?
                 AND active = TRUE`,
              [row.id]
            );
          } else {
            await update('patient_assignments', {
              active: false
            }, { id: row.id });
          }

          removed.push({
            id: Number(row.id),
            user_id: Number(row.user_id),
            assignment_role: role
          });

          await logAuditEvent(req.user.id, 'UNASSIGN', 'PATIENT_ASSIGNMENT', Number(row.id), null, {
            patient_id: Number(patientId),
            user_id: Number(row.user_id),
            assignment_role: role
          });
        }
      }
    }

    const statusCode = created.length > 0 ? 201 : 200;
    res.status(statusCode).json({
      success: true,
      message: syncMode
        ? req.user.role === 'RECEPTION'
          ? `Assignment update submitted (${created.length} immediate, ${removed.length} immediate removals, ${pending.length} pending confirmation, ${skipped.length} unchanged).`
          : `Patient assignments synchronized (${created.length} created, ${removed.length} removed, ${skipped.length} unchanged)`
        : created.length > 0
          ? `Patient assignments updated (${created.length} created, ${skipped.length} skipped)`
          : 'No new assignments were created',
      data: {
        created,
        skipped,
        removed,
        pending
      }
    });
  } catch (error) {
    console.error('Assign patient member error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
};

const getPendingAssignmentRequests = async (req, res) => {
  try {
    if (!['ORTHODONTIST', 'DENTAL_SURGEON'].includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        message: 'You do not have permission to view assignment approvals'
      });
    }

    const requests = await query(
      `SELECT par.id, par.patient_id, par.target_user_id, par.target_role, par.action_type, par.requested_by,
              par.status, par.created_at,
              p.patient_code, p.first_name, p.last_name,
              u_req.name AS requested_by_name
       FROM patient_assignment_requests par
       JOIN patients p ON p.id = par.patient_id
       JOIN users u_req ON u_req.id = par.requested_by
       WHERE par.target_user_id = ?
         AND par.status = 'PENDING'
         AND p.deleted_at IS NULL
       ORDER BY par.created_at ASC`,
      [req.user.id]
    );

    res.json({
      success: true,
      data: requests
    });
  } catch (error) {
    console.error('Get pending assignment requests error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
};

const respondToAssignmentRequest = async (req, res) => {
  try {
    if (!['ORTHODONTIST', 'DENTAL_SURGEON'].includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        message: 'You do not have permission to respond to assignment approvals'
      });
    }

    const requestId = Number(req.params.requestId);
    const decision = String(req.body?.decision || '').toUpperCase();
    if (!Number.isInteger(requestId) || requestId <= 0) {
      return res.status(400).json({
        success: false,
        message: 'Invalid request id'
      });
    }
    if (!['APPROVE', 'REJECT'].includes(decision)) {
      return res.status(400).json({
        success: false,
        message: 'decision must be APPROVE or REJECT'
      });
    }

    const rows = await query(
      `SELECT *
       FROM patient_assignment_requests
       WHERE id = ?
         AND target_user_id = ?
         AND status = 'PENDING'
       LIMIT 1`,
      [requestId, req.user.id]
    );
    const request = rows[0];
    if (!request) {
      return res.status(404).json({
        success: false,
        message: 'Assignment request not found'
      });
    }

    if (decision === 'APPROVE') {
      if (String(request.action_type).toUpperCase() === 'ASSIGN') {
        const existing = await query(
          `SELECT id
           FROM patient_assignments
           WHERE patient_id = ?
             AND user_id = ?
             AND assignment_role = ?
             AND active = TRUE
           LIMIT 1`,
          [request.patient_id, request.target_user_id, request.target_role]
        );
        if (!existing.length) {
          const assignmentId = await insert('patient_assignments', {
            patient_id: Number(request.patient_id),
            user_id: Number(request.target_user_id),
            assignment_role: String(request.target_role).toUpperCase(),
            assigned_by: Number(request.requested_by),
            active: true
          });
          await logAuditEvent(req.user.id, 'ASSIGN_APPROVED', 'PATIENT_ASSIGNMENT', assignmentId, null, {
            request_id: Number(request.id),
            patient_id: Number(request.patient_id),
            user_id: Number(request.target_user_id),
            assignment_role: String(request.target_role).toUpperCase()
          });
        }
      } else {
        const tupleParams = [request.patient_id, request.target_user_id, request.target_role];
        const existingInactive = await query(
          `SELECT id
           FROM patient_assignments
           WHERE patient_id = ?
             AND user_id = ?
             AND assignment_role = ?
             AND active = FALSE
           LIMIT 1`,
          tupleParams
        );

        if (existingInactive.length) {
          await query(
            `DELETE FROM patient_assignments
             WHERE patient_id = ?
               AND user_id = ?
               AND assignment_role = ?
               AND active = TRUE`,
            tupleParams
          );
        } else {
          await query(
            `UPDATE patient_assignments
             SET active = FALSE, updated_at = CURRENT_TIMESTAMP
             WHERE patient_id = ?
               AND user_id = ?
               AND assignment_role = ?
               AND active = TRUE`,
            tupleParams
          );
        }

        await logAuditEvent(req.user.id, 'UNASSIGN_APPROVED', 'PATIENT_ASSIGNMENT', null, null, {
          request_id: Number(request.id),
          patient_id: Number(request.patient_id),
          user_id: Number(request.target_user_id),
          assignment_role: String(request.target_role).toUpperCase()
        });
      }
    } else {
      await logAuditEvent(req.user.id, 'ASSIGNMENT_CHANGE_REJECTED', 'PATIENT_ASSIGNMENT', null, null, {
        request_id: Number(request.id),
        patient_id: Number(request.patient_id),
        user_id: Number(request.target_user_id),
        assignment_role: String(request.target_role).toUpperCase(),
        action_type: String(request.action_type).toUpperCase()
      });
    }

    await query(
      `UPDATE patient_assignment_requests
       SET status = ?, reviewed_by = ?, reviewed_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
      [decision === 'APPROVE' ? 'APPROVED' : 'REJECTED', req.user.id, requestId]
    );

    res.json({
      success: true,
      message: decision === 'APPROVE'
        ? 'Assignment request approved'
        : 'Assignment request rejected'
    });
  } catch (error) {
    console.error('Respond assignment request error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
};

const getPatientAssignments = async (req, res) => {
  try {
    const { id: patientId } = req.params;
    const patient = await findOne('patients', { id: patientId, deleted_at: null });
    if (!patient) {
      return res.status(404).json({
        success: false,
        message: 'Patient not found'
      });
    }

    const assignments = await query(
      `SELECT pa.id, pa.patient_id, pa.user_id, pa.assignment_role, pa.active, pa.created_at,
              u.name AS user_name, u.email AS user_email
       FROM patient_assignments pa
       JOIN users u ON u.id = pa.user_id
       WHERE pa.patient_id = ?
         AND pa.active = TRUE
         AND u.status = 'ACTIVE'
         AND u.role = pa.assignment_role
       ORDER BY pa.assignment_role, pa.created_at DESC`,
      [patientId]
    );

    res.json({
      success: true,
      data: assignments
    });
  } catch (error) {
    console.error('Get patient assignments error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
};

const getDentalChart = async (req, res) => {
  try {
    const { id: patientId } = req.params;
    const patient = await findOne('patients', { id: patientId, deleted_at: null });
    if (!patient) {
      return res.status(404).json({
        success: false,
        message: 'Patient not found'
      });
    }

    const rows = await query(
      `SELECT d.id, d.patient_id, d.tooth_number, d.status,
              d.is_pathology, d.is_planned, d.is_treated, d.is_missing,
              d.pathology, d.treatment, d.event_date,
              d.updated_by, d.created_at, d.updated_at, u.name AS updated_by_name
       FROM dental_chart_entries d
       LEFT JOIN users u ON u.id = d.updated_by
       WHERE d.patient_id = ?
       ORDER BY d.tooth_number ASC`,
      [patientId]
    );

    res.json({
      success: true,
      data: rows
    });
  } catch (error) {
    console.error('Get dental chart error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
};

const upsertDentalChartEntry = async (req, res) => {
  try {
    const { id: patientId, toothNumber } = req.params;
    const numericTooth = Number(toothNumber);
    const patient = await findOne('patients', { id: patientId, deleted_at: null });
    if (!patient) {
      return res.status(404).json({
        success: false,
        message: 'Patient not found'
      });
    }

    if (!Number.isInteger(numericTooth) || numericTooth < 1 || numericTooth > 32) {
      return res.status(400).json({
        success: false,
        message: 'toothNumber must be between 1 and 32'
      });
    }

    const pathologyFlagInput = req.body.is_pathology ?? req.body.isPathology;
    const plannedFlagInput = req.body.is_planned ?? req.body.isPlanned;
    const treatedFlagInput = req.body.is_treated ?? req.body.isTreated;
    const missingFlagInput = req.body.is_missing ?? req.body.isMissing;

    const status = String(req.body.status || 'HEALTHY').toUpperCase();
    const allowedStatuses = new Set(['HEALTHY', 'PATHOLOGY', 'PLANNED', 'TREATED', 'MISSING']);
    if (!allowedStatuses.has(status)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid tooth status'
      });
    }

    const isPathology = pathologyFlagInput !== undefined ? Boolean(pathologyFlagInput) : status === 'PATHOLOGY';
    const isPlanned = plannedFlagInput !== undefined ? Boolean(plannedFlagInput) : status === 'PLANNED';
    const isTreated = treatedFlagInput !== undefined ? Boolean(treatedFlagInput) : status === 'TREATED';
    const isMissing = missingFlagInput !== undefined ? Boolean(missingFlagInput) : status === 'MISSING';

    const payload = {
      patient_id: Number(patientId),
      tooth_number: numericTooth,
      status,
      is_pathology: isPathology,
      is_planned: isPlanned,
      is_treated: isTreated,
      is_missing: isMissing,
      pathology: req.body.pathology || null,
      treatment: req.body.treatment || null,
      event_date: req.body.event_date || null,
      updated_by: req.user.id
    };

    await query(
      `INSERT INTO dental_chart_entries
        (patient_id, tooth_number, status, is_pathology, is_planned, is_treated, is_missing, pathology, treatment, event_date, updated_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE
        status = VALUES(status),
        is_pathology = VALUES(is_pathology),
        is_planned = VALUES(is_planned),
        is_treated = VALUES(is_treated),
        is_missing = VALUES(is_missing),
        pathology = VALUES(pathology),
        treatment = VALUES(treatment),
        event_date = VALUES(event_date),
        updated_by = VALUES(updated_by),
        updated_at = CURRENT_TIMESTAMP`,
      [
        payload.patient_id,
        payload.tooth_number,
        payload.status,
        payload.is_pathology,
        payload.is_planned,
        payload.is_treated,
        payload.is_missing,
        payload.pathology,
        payload.treatment,
        payload.event_date,
        payload.updated_by
      ]
    );

    await logAuditEvent(req.user.id, 'UPSERT', 'DENTAL_CHART_ENTRY', null, null, payload);

    const rows = await query(
      `SELECT d.id, d.patient_id, d.tooth_number, d.status,
              d.is_pathology, d.is_planned, d.is_treated, d.is_missing,
              d.pathology, d.treatment, d.event_date,
              d.updated_by, d.created_at, d.updated_at, u.name AS updated_by_name
       FROM dental_chart_entries d
       LEFT JOIN users u ON u.id = d.updated_by
       WHERE d.patient_id = ? AND d.tooth_number = ?
       LIMIT 1`,
      [patientId, numericTooth]
    );

    res.json({
      success: true,
      message: 'Dental chart entry saved successfully',
      data: rows[0]
    });
  } catch (error) {
    console.error('Upsert dental chart entry error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
};

const deleteDentalChartEntry = async (req, res) => {
  try {
    const { id: patientId, toothNumber } = req.params;
    const numericTooth = Number(toothNumber);
    const patient = await findOne('patients', { id: patientId, deleted_at: null });
    if (!patient) {
      return res.status(404).json({
        success: false,
        message: 'Patient not found'
      });
    }

    await query(
      'DELETE FROM dental_chart_entries WHERE patient_id = ? AND tooth_number = ?',
      [patientId, numericTooth]
    );

    await logAuditEvent(req.user.id, 'DELETE', 'DENTAL_CHART_ENTRY', null, null, {
      patient_id: Number(patientId),
      tooth_number: numericTooth
    });

    res.json({
      success: true,
      message: 'Dental chart entry removed'
    });
  } catch (error) {
    console.error('Delete dental chart entry error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
};

const CUSTOM_TOOTH_CODE_RE = /^(ADULT-\d{1,2}|MILK-[5-8]-[A-E])$/;

const getDentalChartCustom = async (req, res) => {
  try {
    const { id: patientId } = req.params;
    const patient = await findOne('patients', { id: patientId, deleted_at: null });
    if (!patient) {
      return res.status(404).json({
        success: false,
        message: 'Patient not found'
      });
    }

    const rows = await query(
      `SELECT d.id, d.patient_id, d.tooth_code, d.dentition, d.notation_x, d.notation_y, d.status,
              d.is_pathology, d.is_planned, d.is_treated, d.is_missing,
              d.pathology, d.treatment, d.event_date,
              d.updated_by, d.created_at, d.updated_at, u.name AS updated_by_name
       FROM dental_chart_custom_entries d
       LEFT JOIN users u ON u.id = d.updated_by
       WHERE d.patient_id = ?
       ORDER BY
         CASE d.dentition WHEN 'MILK' THEN 1 ELSE 2 END,
         d.tooth_code ASC`,
      [patientId]
    );

    res.json({
      success: true,
      data: rows
    });
  } catch (error) {
    console.error('Get custom dental chart error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
};

const upsertDentalChartCustomEntry = async (req, res) => {
  try {
    const { id: patientId, toothCode } = req.params;
    const decodedToothCode = decodeURIComponent(String(toothCode || '')).toUpperCase();
    const patient = await findOne('patients', { id: patientId, deleted_at: null });
    if (!patient) {
      return res.status(404).json({
        success: false,
        message: 'Patient not found'
      });
    }

    if (!CUSTOM_TOOTH_CODE_RE.test(decodedToothCode)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid tooth code'
      });
    }

    const dentition = String(req.body.dentition || '').toUpperCase();
    if (!['ADULT', 'MILK'].includes(dentition)) {
      return res.status(400).json({
        success: false,
        message: 'dentition must be ADULT or MILK'
      });
    }

    const notationX = String(req.body.notation_x ?? '').trim();
    const notationY = String(req.body.notation_y ?? '').trim();
    if (!notationX || !notationY) {
      return res.status(400).json({
        success: false,
        message: 'notation_x and notation_y are required'
      });
    }

    const pathologyFlagInput = req.body.is_pathology ?? req.body.isPathology;
    const plannedFlagInput = req.body.is_planned ?? req.body.isPlanned;
    const treatedFlagInput = req.body.is_treated ?? req.body.isTreated;
    const missingFlagInput = req.body.is_missing ?? req.body.isMissing;

    const status = String(req.body.status || 'HEALTHY').toUpperCase();
    const allowedStatuses = new Set(['HEALTHY', 'PATHOLOGY', 'PLANNED', 'TREATED', 'MISSING']);
    if (!allowedStatuses.has(status)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid tooth status'
      });
    }

    const isPathology = pathologyFlagInput !== undefined ? Boolean(pathologyFlagInput) : status === 'PATHOLOGY';
    const isPlanned = plannedFlagInput !== undefined ? Boolean(plannedFlagInput) : status === 'PLANNED';
    const isTreated = treatedFlagInput !== undefined ? Boolean(treatedFlagInput) : status === 'TREATED';
    const isMissing = missingFlagInput !== undefined ? Boolean(missingFlagInput) : status === 'MISSING';

    const payload = {
      patient_id: Number(patientId),
      tooth_code: decodedToothCode,
      dentition,
      notation_x: notationX,
      notation_y: notationY,
      status,
      is_pathology: isPathology,
      is_planned: isPlanned,
      is_treated: isTreated,
      is_missing: isMissing,
      pathology: req.body.pathology || null,
      treatment: req.body.treatment || null,
      event_date: req.body.event_date || null,
      updated_by: req.user.id
    };

    await query(
      `INSERT INTO dental_chart_custom_entries
        (patient_id, tooth_code, dentition, notation_x, notation_y, status,
         is_pathology, is_planned, is_treated, is_missing, pathology, treatment, event_date, updated_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE
        dentition = VALUES(dentition),
        notation_x = VALUES(notation_x),
        notation_y = VALUES(notation_y),
        status = VALUES(status),
        is_pathology = VALUES(is_pathology),
        is_planned = VALUES(is_planned),
        is_treated = VALUES(is_treated),
        is_missing = VALUES(is_missing),
        pathology = VALUES(pathology),
        treatment = VALUES(treatment),
        event_date = VALUES(event_date),
        updated_by = VALUES(updated_by),
        updated_at = CURRENT_TIMESTAMP`,
      [
        payload.patient_id,
        payload.tooth_code,
        payload.dentition,
        payload.notation_x,
        payload.notation_y,
        payload.status,
        payload.is_pathology,
        payload.is_planned,
        payload.is_treated,
        payload.is_missing,
        payload.pathology,
        payload.treatment,
        payload.event_date,
        payload.updated_by
      ]
    );

    await logAuditEvent(req.user.id, 'UPSERT', 'DENTAL_CHART_CUSTOM_ENTRY', null, null, payload);

    const rows = await query(
      `SELECT d.id, d.patient_id, d.tooth_code, d.dentition, d.notation_x, d.notation_y, d.status,
              d.is_pathology, d.is_planned, d.is_treated, d.is_missing,
              d.pathology, d.treatment, d.event_date,
              d.updated_by, d.created_at, d.updated_at, u.name AS updated_by_name
       FROM dental_chart_custom_entries d
       LEFT JOIN users u ON u.id = d.updated_by
       WHERE d.patient_id = ? AND d.tooth_code = ?
       LIMIT 1`,
      [patientId, decodedToothCode]
    );

    res.json({
      success: true,
      message: 'Custom dental chart entry saved successfully',
      data: rows[0]
    });
  } catch (error) {
    console.error('Upsert custom dental chart entry error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
};

const deleteDentalChartCustomEntry = async (req, res) => {
  try {
    const { id: patientId, toothCode } = req.params;
    const decodedToothCode = decodeURIComponent(String(toothCode || '')).toUpperCase();
    const patient = await findOne('patients', { id: patientId, deleted_at: null });
    if (!patient) {
      return res.status(404).json({
        success: false,
        message: 'Patient not found'
      });
    }

    if (!CUSTOM_TOOTH_CODE_RE.test(decodedToothCode)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid tooth code'
      });
    }

    await query(
      'DELETE FROM dental_chart_custom_entries WHERE patient_id = ? AND tooth_code = ?',
      [patientId, decodedToothCode]
    );

    await logAuditEvent(req.user.id, 'DELETE', 'DENTAL_CHART_CUSTOM_ENTRY', null, null, {
      patient_id: Number(patientId),
      tooth_code: decodedToothCode
    });

    res.json({
      success: true,
      message: 'Custom dental chart entry removed'
    });
  } catch (error) {
    console.error('Delete custom dental chart entry error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
};

const listDentalChartVersions = async (req, res) => {
  try {
    const { id: patientId } = req.params;
    const { page = 1, limit = 20, deleted = 'active' } = req.query;
    const offset = (Number(page) - 1) * Number(limit);

    const patient = await findOne('patients', { id: patientId, deleted_at: null });
    if (!patient) {
      return res.status(404).json({
        success: false,
        message: 'Patient not found'
      });
    }

    const deletedMode = String(deleted || 'active').toLowerCase();
    if (!['active', 'trashed', 'all'].includes(deletedMode)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid deleted mode'
      });
    }

    if ((deletedMode === 'trashed' || deletedMode === 'all') && req.user.role !== 'ORTHODONTIST') {
      return res.status(403).json({
        success: false,
        message: 'Only assigned orthodontist can access annotated chart bin'
      });
    }

    let whereClause = 'WHERE v.patient_id = ?';
    const params = [patientId];
    if (deletedMode === 'active') {
      whereClause += ' AND v.deleted_at IS NULL';
    } else if (deletedMode === 'trashed') {
      whereClause += ' AND v.deleted_at IS NOT NULL';
    }

    const countRows = await query(
      `SELECT COUNT(*) AS total
       FROM dental_chart_versions v
       ${whereClause}`,
      params
    );
    const total = Number(countRows[0]?.total || 0);

    const rows = await query(
      `SELECT v.id, v.patient_id, v.version_label, v.entry_count, v.snapshot_data,
              v.annotated_by, v.deleted_at, v.deleted_by, v.created_at, v.updated_at,
              au.name AS annotated_by_name,
              du.name AS deleted_by_name
       FROM dental_chart_versions v
       LEFT JOIN users au ON au.id = v.annotated_by
       LEFT JOIN users du ON du.id = v.deleted_by
       ${whereClause}
       ORDER BY v.created_at DESC
       LIMIT ? OFFSET ?`,
      [...params, Number(limit), offset]
    );

    res.json({
      success: true,
      data: {
        versions: rows.map((row) => normalizeDentalChartVersionRow(row)),
        pagination: {
          current_page: Number(page),
          total_pages: Math.ceil(total / Number(limit || 1)),
          total_records: total,
          limit: Number(limit)
        }
      }
    });
  } catch (error) {
    console.error('List dental chart versions error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
};

const createDentalChartVersion = async (req, res) => {
  try {
    const { id: patientId } = req.params;
    const patient = await findOne('patients', { id: patientId, deleted_at: null });
    if (!patient) {
      return res.status(404).json({
        success: false,
        message: 'Patient not found'
      });
    }

    const rows = await query(
      `SELECT d.tooth_code, d.dentition, d.notation_x, d.notation_y, d.status,
              d.is_pathology, d.is_planned, d.is_treated, d.is_missing,
              d.pathology, d.treatment, d.event_date, d.updated_by, d.updated_at
       FROM dental_chart_custom_entries d
       WHERE d.patient_id = ?
       ORDER BY
         CASE d.dentition WHEN 'MILK' THEN 1 ELSE 2 END,
         d.tooth_code ASC`,
      [patientId]
    );

    const timestamp = new Date().toISOString().replace('T', ' ').slice(0, 19);
    const requestedLabel = String(req.body?.version_label || '').trim();
    const versionLabel = requestedLabel || `Annotated Chart ${timestamp}`;

    const versionId = await insert('dental_chart_versions', {
      patient_id: Number(patientId),
      version_label: versionLabel.slice(0, 255),
      snapshot_data: JSON.stringify(rows),
      entry_count: rows.length,
      annotated_by: req.user.id
    });

    await logAuditEvent(req.user.id, 'CREATE', 'DENTAL_CHART_VERSION', versionId, null, {
      patient_id: Number(patientId),
      version_label: versionLabel,
      entry_count: rows.length
    });

    const savedRows = await query(
      `SELECT v.id, v.patient_id, v.version_label, v.entry_count, v.snapshot_data,
              v.annotated_by, v.deleted_at, v.deleted_by, v.created_at, v.updated_at,
              au.name AS annotated_by_name
       FROM dental_chart_versions v
       LEFT JOIN users au ON au.id = v.annotated_by
       WHERE v.id = ?
       LIMIT 1`,
      [versionId]
    );

    res.status(201).json({
      success: true,
      message: 'Dental chart version saved successfully',
      data: normalizeDentalChartVersionRow(savedRows[0] || null)
    });
  } catch (error) {
    console.error('Create dental chart version error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
};

const downloadDentalChartVersion = async (req, res) => {
  try {
    const { id: patientId, versionId } = req.params;
    const format = String(req.query.format || 'pdf').toLowerCase();
    if (!['pdf', 'json'].includes(format)) {
      return res.status(400).json({
        success: false,
        message: 'Unsupported format. Use pdf or json.'
      });
    }

    const patient = await findOne('patients', { id: patientId, deleted_at: null });
    if (!patient) {
      return res.status(404).json({
        success: false,
        message: 'Patient not found'
      });
    }

    const rows = await query(
      `SELECT v.*, u.name AS annotated_by_name
       FROM dental_chart_versions v
       LEFT JOIN users u ON u.id = v.annotated_by
       WHERE v.id = ? AND v.patient_id = ? AND v.deleted_at IS NULL
       LIMIT 1`,
      [versionId, patientId]
    );
    const version = normalizeDentalChartVersionRow(rows[0] || null);
    if (!version) {
      return res.status(404).json({
        success: false,
        message: 'Annotated chart version not found'
      });
    }

    const safeLabel = String(version.version_label || `version-${version.id}`)
      .replace(/[^a-zA-Z0-9-_]+/g, '_')
      .replace(/^_+|_+$/g, '')
      .slice(0, 80);
    if (format === 'json') {
      const filename = `${safeLabel || `dental_chart_version_${version.id}`}.json`;
      res.setHeader('Content-Type', 'application/json');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      return res.status(200).send(JSON.stringify({
        patient: {
          id: Number(patientId),
          patient_code: patient.patient_code,
          name: `${patient.first_name || ''} ${patient.last_name || ''}`.trim()
        },
        version: {
          id: version.id,
          label: version.version_label,
          entry_count: version.entry_count,
          annotated_by: version.annotated_by,
          annotated_by_name: version.annotated_by_name || null,
          created_at: version.created_at
        },
        entries: version.snapshot_data || []
      }, null, 2));
    }

    const filename = `${safeLabel || `dental_chart_version_${version.id}`}.pdf`;
    let pdfBuffer;
    try {
      pdfBuffer = await buildDentalChartVersionVisualPdf({ patient, version });
    } catch (visualPdfError) {
      console.warn('Visual PDF generation unavailable, using fallback PDF:', visualPdfError?.message || visualPdfError);
      pdfBuffer = buildDentalChartVersionPdf({ patient, version });
    }
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Content-Length', String(pdfBuffer.length));
    return res.status(200).send(pdfBuffer);
  } catch (error) {
    console.error('Download dental chart version error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
};

const deleteDentalChartVersion = async (req, res) => {
  try {
    const { id: patientId, versionId } = req.params;
    const permanent = String(req.query.permanent || '').toLowerCase() === 'true';

    const patient = await findOne('patients', { id: patientId, deleted_at: null });
    if (!patient) {
      return res.status(404).json({
        success: false,
        message: 'Patient not found'
      });
    }

    const isAssignedOrthodontist = await ensureAssignedOrthodontist(patientId, req.user.id);
    if (!isAssignedOrthodontist) {
      return res.status(403).json({
        success: false,
        message: 'Only assigned orthodontist can manage annotated chart versions'
      });
    }

    const rows = await query(
      `SELECT *
       FROM dental_chart_versions
       WHERE id = ? AND patient_id = ?
       LIMIT 1`,
      [versionId, patientId]
    );
    const existingVersion = rows[0];
    if (!existingVersion) {
      return res.status(404).json({
        success: false,
        message: 'Annotated chart version not found'
      });
    }

    if (permanent) {
      if (!existingVersion.deleted_at) {
        return res.status(400).json({
          success: false,
          message: 'Annotated chart version must be moved to bin before permanent deletion'
        });
      }

      await remove('dental_chart_versions', { id: versionId }, false);
      await logAuditEvent(req.user.id, 'HARD_DELETE', 'DENTAL_CHART_VERSION', Number(versionId), existingVersion, null);
      return res.json({
        success: true,
        message: 'Annotated chart version permanently deleted'
      });
    }

    if (existingVersion.deleted_at) {
      return res.status(400).json({
        success: false,
        message: 'Annotated chart version already in bin'
      });
    }

    await update('dental_chart_versions', { deleted_at: new Date(), deleted_by: req.user.id }, { id: versionId });
    await logAuditEvent(req.user.id, 'DELETE', 'DENTAL_CHART_VERSION', Number(versionId), existingVersion, {
      deleted_at: new Date(),
      deleted_by: req.user.id
    });

    return res.json({
      success: true,
      message: 'Annotated chart version moved to bin'
    });
  } catch (error) {
    console.error('Delete dental chart version error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
};

const restoreDentalChartVersion = async (req, res) => {
  try {
    const { id: patientId, versionId } = req.params;

    const patient = await findOne('patients', { id: patientId, deleted_at: null });
    if (!patient) {
      return res.status(404).json({
        success: false,
        message: 'Patient not found'
      });
    }

    const isAssignedOrthodontist = await ensureAssignedOrthodontist(patientId, req.user.id);
    if (!isAssignedOrthodontist) {
      return res.status(403).json({
        success: false,
        message: 'Only assigned orthodontist can manage annotated chart versions'
      });
    }

    const rows = await query(
      `SELECT *
       FROM dental_chart_versions
       WHERE id = ? AND patient_id = ?
       LIMIT 1`,
      [versionId, patientId]
    );
    const existingVersion = rows[0];
    if (!existingVersion) {
      return res.status(404).json({
        success: false,
        message: 'Annotated chart version not found'
      });
    }

    if (!existingVersion.deleted_at) {
      return res.status(400).json({
        success: false,
        message: 'Annotated chart version is not in bin'
      });
    }

    await update('dental_chart_versions', { deleted_at: null, deleted_by: null }, { id: versionId });
    await logAuditEvent(req.user.id, 'RESTORE', 'DENTAL_CHART_VERSION', Number(versionId), existingVersion, {
      deleted_at: null,
      deleted_by: null
    });

    return res.json({
      success: true,
      message: 'Annotated chart version restored successfully'
    });
  } catch (error) {
    console.error('Restore dental chart version error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
};

const getPatientHistory = async (req, res) => {
  try {
    const { id: patientId } = req.params;
    const patient = await findOne('patients', { id: patientId, deleted_at: null });
    if (!patient) {
      return res.status(404).json({
        success: false,
        message: 'Patient not found'
      });
    }

    const historyRows = await query(
      `SELECT ph.id, ph.patient_id, ph.form_data, ph.updated_by, ph.created_at, ph.updated_at, u.name AS updated_by_name
       FROM patient_histories ph
       LEFT JOIN users u ON u.id = ph.updated_by
       WHERE ph.patient_id = ?
       LIMIT 1`,
      [patientId]
    );

    const sex = patient.gender === 'MALE' ? 'M' : patient.gender === 'FEMALE' ? 'F' : 'O';
    const auto = {
      name: `${patient.first_name || ''} ${patient.last_name || ''}`.trim(),
      address: patient.address || '',
      age: Math.floor((new Date() - new Date(patient.date_of_birth)) / (365.25 * 24 * 60 * 60 * 1000)),
      birthday: patient.date_of_birth ? String(patient.date_of_birth).slice(0, 10) : '',
      telephone: patient.phone || '',
      sex,
      province: patient.province || '',
      date_of_examination: patient.created_at ? String(patient.created_at).slice(0, 10) : new Date().toISOString().slice(0, 10)
    };

    const row = historyRows[0] || null;
    let normalizedHistory = {};
    if (row?.form_data && typeof row.form_data === 'object') {
      normalizedHistory = row.form_data;
    } else if (typeof row?.form_data === 'string') {
      try {
        normalizedHistory = JSON.parse(row.form_data);
      } catch (_) {
        normalizedHistory = {};
      }
    }

    res.json({
      success: true,
      data: {
        auto,
        history: normalizedHistory,
        metadata: row
          ? {
              id: row.id,
              updated_by: row.updated_by,
              updated_by_name: row.updated_by_name,
              created_at: row.created_at,
              updated_at: row.updated_at
            }
          : null
      }
    });
  } catch (error) {
    console.error('Get patient history error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
};

const upsertPatientHistory = async (req, res) => {
  try {
    const { id: patientId } = req.params;
    const patient = await findOne('patients', { id: patientId, deleted_at: null });
    if (!patient) {
      return res.status(404).json({
        success: false,
        message: 'Patient not found'
      });
    }

    const historyPayload = req.body?.history || {};
    const consultantOnlyKeys = [
      'consultant_not_taken_prognosis',
      'consultant_mixed_dentition_review',
      'consultant_urgent_interceptive_treatment',
      'consultant_take_up_treatment_modes',
      'consultant_waiting_list_mode',
      'consultant_priority',
      'consultant_signature',
      'consultant_date'
    ];

    if (req.user.role !== 'ORTHODONTIST') {
      const existingRows = await query(
        `SELECT form_data
         FROM patient_histories
         WHERE patient_id = ?
         LIMIT 1`,
        [patientId]
      );
      let existingForm = {};
      const existing = existingRows[0];
      if (existing?.form_data && typeof existing.form_data === 'object') {
        existingForm = existing.form_data;
      } else if (typeof existing?.form_data === 'string') {
        try {
          existingForm = JSON.parse(existing.form_data);
        } catch (_) {
          existingForm = {};
        }
      }

      consultantOnlyKeys.forEach((key) => {
        if (Object.prototype.hasOwnProperty.call(existingForm, key)) {
          historyPayload[key] = existingForm[key];
        } else {
          delete historyPayload[key];
        }
      });
    }
    await query(
      `INSERT INTO patient_histories (patient_id, form_data, updated_by)
       VALUES (?, ?, ?)
       ON DUPLICATE KEY UPDATE
         form_data = VALUES(form_data),
         updated_by = VALUES(updated_by),
         updated_at = CURRENT_TIMESTAMP`,
      [patientId, JSON.stringify(historyPayload), req.user.id]
    );

    await logAuditEvent(req.user.id, 'UPSERT', 'PATIENT_HISTORY', null, null, {
      patient_id: Number(patientId),
      keys: Object.keys(historyPayload || {})
    });

    const rows = await query(
      `SELECT ph.id, ph.patient_id, ph.form_data, ph.updated_by, ph.created_at, ph.updated_at, u.name AS updated_by_name
       FROM patient_histories ph
       LEFT JOIN users u ON u.id = ph.updated_by
       WHERE ph.patient_id = ?
       LIMIT 1`,
      [patientId]
    );

    const saved = rows[0] || null;
    let normalizedFormData = {};
    if (saved?.form_data && typeof saved.form_data === 'object') {
      normalizedFormData = saved.form_data;
    } else if (typeof saved?.form_data === 'string') {
      try {
        normalizedFormData = JSON.parse(saved.form_data);
      } catch (_) {
        normalizedFormData = {};
      }
    }

    res.json({
      success: true,
      message: 'Patient history saved successfully',
      data: saved
        ? {
            ...saved,
            form_data: normalizedFormData
          }
        : null
    });
  } catch (error) {
    console.error('Upsert patient history error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
};

module.exports = {
  getPatients,
  getPatientById,
  createPatient,
  updatePatient,
  deletePatient,
  reactivatePatient,
  getPatientStats,
  getActiveOrthodontists,
  getAssignableStaff,
  assignPatientMember,
  getPatientAssignments,
  getPendingAssignmentRequests,
  respondToAssignmentRequest,
  getDentalChart,
  upsertDentalChartEntry,
  deleteDentalChartEntry,
  getDentalChartCustom,
  upsertDentalChartCustomEntry,
  deleteDentalChartCustomEntry,
  listDentalChartVersions,
  createDentalChartVersion,
  downloadDentalChartVersion,
  deleteDentalChartVersion,
  restoreDentalChartVersion,
  getPatientHistory,
  upsertPatientHistory
};
