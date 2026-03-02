# OrthoFlow Full-Stack Integration Guide (Current System)

This document reflects the current implementation in this repository as of March 2026.

## 1. System Overview

OrthoFlow is a full-stack orthodontic workflow platform with:

- Backend: Node.js + Express + MySQL (`/Backend`)
- Frontend: React + Vite (`/Frontend`)
- Auth: Email/password + Google Sign-In (ID token flow)
- Security: JWT access/refresh tokens, enforced inactivity session timeout
- Core domains: Patients, visits, queue, documents, diagnosis/treatment notes, dental chart, cases, inventory, users, reports, audit logs

## 2. Current Project Structure

```text
Orthodontics Workflow Automation System/
├── Backend/
│   ├── server.js
│   ├── .env.example
│   ├── scripts/
│   │   ├── migrate.js
│   │   └── seed.js
│   └── src/
├── Frontend/
│   ├── .env.example
│   └── src/app/
├── start-orthoflow.sh
├── test-run-all-valid.js
└── test-*.js
```

## 3. Prerequisites

- Node.js 18+ recommended
- npm
- MySQL 8+
- Chromium dependencies if you want visual dental-chart PDF generation via Playwright

## 4. Backend Setup

Run from `/Backend`:

```bash
npm install
cp .env.example .env
```

Update `Backend/.env` with real values:

```env
PORT=3000
NODE_ENV=development

DB_HOST=localhost
DB_PORT=3306
DB_USER=root
DB_PASSWORD=your_password
DB_NAME=orthoflow

JWT_SECRET=change_this
JWT_REFRESH_SECRET=change_this
JWT_EXPIRE=24h
JWT_REFRESH_EXPIRE=7d
SESSION_TIMEOUT_SECONDS=3600

GOOGLE_CLIENT_ID=your_google_client_id.apps.googleusercontent.com

AUDIT_LOG_RETENTION_ENABLED=true
AUDIT_LOG_RETENTION_DAYS=180
AUDIT_LOG_CLEANUP_INTERVAL_HOURS=24
AUDIT_LOG_CLEANUP_BATCH_SIZE=5000
AUDIT_LOG_ARCHIVE_BEFORE_DELETE=false

UPLOAD_DIR=./src/uploads
MAX_FILE_SIZE=104857600
ALLOWED_FILE_TYPES=jpg,jpeg,png,pdf,doc,docx

RATE_LIMIT_WINDOW_MS=900000
RATE_LIMIT_MAX_REQUESTS=100

CORS_ORIGIN=http://localhost:5173

EMAIL_SIMULATION=true
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=your_email
SMTP_PASS=your_app_password
SMTP_FROM=your_email
```

Initialize DB:

```bash
npm run migrate
npm run seed
```

Start backend:

```bash
npm run dev
```

Backend health check:

```bash
curl http://localhost:3000/health
```

## 5. Frontend Setup

Run from `/Frontend`:

```bash
npm install
cp .env.example .env
```

Set frontend env:

```env
VITE_GOOGLE_CLIENT_ID=your_google_client_id.apps.googleusercontent.com
```

Start frontend:

```bash
npm run dev
```

Frontend URL:

- `http://localhost:5173`

## 6. Quick Start (Both Services)

Option A (recommended): two terminals

1. Terminal 1:
```bash
cd Backend && npm run dev
```
2. Terminal 2:
```bash
cd Frontend && npm run dev
```

Option B (macOS helper script from project root):

```bash
./start-orthoflow.sh
```

## 7. Google Login Configuration (Real)

1. In Google Cloud Console:
- Create OAuth Client ID (Web application)
- Authorized JavaScript origins:
  - `http://localhost:5173`
  - Your production frontend URL

2. Use the same client ID in both:
- `Backend/.env` -> `GOOGLE_CLIENT_ID`
- `Frontend/.env` -> `VITE_GOOGLE_CLIENT_ID`

3. Notes:
- Backend validates Google ID token audience (`aud`) against `GOOGLE_CLIENT_ID`
- Multiple backend client IDs are supported as comma-separated values

## 8. Session and Password Security (Current Behavior)

- Inactivity timeout is enforced on backend (`SESSION_TIMEOUT_SECONDS`, default 3600 seconds)
- If idle timeout is exceeded, refresh tokens are revoked and re-login is required
- First-login and reset-password flows can require forced password change before normal API access

## 9. Email and Reminder Behavior

- Manual reminder send from UI is supported
- Automatic reminders run in background job (48-hour logic implemented in reminder service)
- If `EMAIL_SIMULATION=true`, reminders are recorded/simulated, not sent via SMTP
- For real sending, set:
  - `EMAIL_SIMULATION=false`
  - valid SMTP values

## 10. Role and Access Highlights (Current)

Core permission model is implemented in `Backend/src/middleware/accessControl.js`.

Important current behavior:

- Admin:
  - Full user account management
  - Reads patient clinical data
  - Reads inventory (inventory create/update/delete is nurse-only by route)
- Orthodontist:
  - Full assigned-patient clinical workflows
  - Can manage dental chart version bin (delete/restore/permanent delete) for assigned patient
- Dental Surgeon + Student:
  - Assignment-scoped access for patient data and clinical workflows
  - Can view/download active dental chart versions for assigned patients
- Reception:
  - Patient general + appointment workflows
  - Cannot edit diagnosis/treatment clinical sections
- Nurse:
  - Cannot edit patient directory general details
  - Inventory create/update/delete/restore routes allowed
  - Sees diagnosis tab with access restriction message (no edit access)
  - Patient appointments are view-only in record context where restricted by UI/flow

## 11. Key Functional Areas Implemented

- Patient directory with search/filtering, active/inactive segmentation, create/edit/assign workflows
- Multi-assignment of patients to multiple orthodontists/surgeons/students
- Patient profile:
  - Overview, visits, patient history, dental chart, documents, diagnosis, treatment plan & notes
- Orthodontic case history form expanded with consultant-only subsection controls
- Dental chart:
  - Adult + milk + customized chart
  - Advanced notation format and colored notation components
  - Custom selected-teeth chart for stats and pathology/planned/treated/missing markers
  - Saved annotated chart versions with chronology + annotator
  - Version download as PDF (visual HTML/Chromium PDF when available, fallback PDF otherwise)
  - Orthodontist-only version trash/restore/permanent delete
- Documents:
  - Up to 10 files per upload batch
  - Max 100MB per batch
  - Soft delete + trash + restore + permanent delete
  - Responsive download feedback
- Clinical notes:
  - Diagnosis and treatment plan/notes with trash/restore/permanent delete patterns
- Inventory:
  - Low stock tracking, transactions, soft delete and recycle bin behavior
  - Safe permanent delete behavior for items with transaction history
- Audit logs:
  - Pagination, filters, page jump, date/time range filtering
  - Retention cleanup job

## 12. Database and Startup Notes

- Backend startup runs DB connection test + schema enforcement:
  - `testConnection()`
  - `ensureAccessControlSchema()`
- Background jobs start on server boot:
  - Audit retention job
  - Auto-reminder job

## 13. Visual Dental Chart PDF Requirement

Visual PDF export attempts headless Chromium generation through Playwright in backend controller.

If visual mode is needed on a new machine:

```bash
cd Backend
npm i playwright
npx playwright install chromium
```

If not available, system falls back to text PDF export automatically.

## 14. Testing Workflow

Main regression runner from project root:

```bash
node test-run-all-valid.js
```

Current suite list includes 43 scripts (API + Playwright).

Targeted tests (examples):

```bash
node test-dental-chart-versions-api.js
node test-nurse-inventory-crud.js
node test-google-auth-api.js
node test-google-login-button-playwright.js
```

## 15. Deployment Checklist (Another Local Server Machine)

1. Install Node.js, npm, MySQL
2. Copy project folder
3. Configure backend env (`Backend/.env`)
4. Configure frontend env (`Frontend/.env`)
5. Create MySQL database and user
6. Run backend migrations/seeds:
   - `cd Backend && npm run migrate && npm run seed`
7. Install dependencies:
   - `cd Backend && npm install`
   - `cd Frontend && npm install`
8. Start services:
   - backend on `:3000`
   - frontend on `:5173`
9. Configure Google OAuth client origins for the deployed frontend URL
10. Configure SMTP + `EMAIL_SIMULATION=false` for real reminder emails
11. Optional: install Playwright Chromium for visual dental PDF exports

## 16. Troubleshooting

- Google sign-in unavailable:
  - Verify both env client IDs are set and identical to OAuth client
  - Verify authorized JS origin includes current frontend URL
- Email reminders not actually sent:
  - Set `EMAIL_SIMULATION=false`
  - Verify SMTP host/port/user/pass/from
- Session expires too quickly/slowly:
  - Check `SESSION_TIMEOUT_SECONDS`
- Versions not visible to assigned users:
  - Confirm patient assignments are active
  - Confirm access is via assigned orthodontist/surgeon/student account
- CORS errors:
  - Ensure `CORS_ORIGIN` matches frontend URL

## 17. Operational Endpoints

- API root: `http://localhost:3000/api`
- Health: `http://localhost:3000/health`
- Frontend: `http://localhost:5173`

