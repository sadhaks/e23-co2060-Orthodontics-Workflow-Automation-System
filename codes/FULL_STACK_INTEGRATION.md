# OrthoFlow Full-Stack Integration Guide

This document reflects the current repository state as of March 6, 2026.

## 1. Current Stack

- Backend: Node.js + Express + MySQL
- Frontend: React + Vite
- Authentication: email/password plus Google Sign-In using Google ID tokens
- Session model: JWT access token + refresh token with inactivity timeout enforcement
- File handling: Multer uploads, document download endpoints, dental-chart PDF export with Playwright fallback support

## 2. Repository Layout

```text
Orthodontics Workflow Automation System/
├── Backend/
│   ├── server.js
│   ├── .env.example
│   ├── database-schema.sql
│   ├── scripts/
│   │   ├── migrate.js
│   │   └── seed.js
│   └── src/
│       ├── controllers/
│       ├── middleware/
│       ├── routes/
│       └── services/
├── Frontend/
│   ├── .env.example
│   └── src/app/
├── start-orthoflow.sh
├── test-run-all-valid.js
└── test-*.js
```

## 3. Backend Integration Surface

`Backend/server.js` starts the API, validates the DB connection, ensures access-control schema updates exist, and starts two background jobs:

- audit log retention cleanup
- automatic appointment reminder processing

Current API roots:

- `/api/auth`
- `/api/patients`
- `/api/visits`
- `/api/documents`
- `/api/clinical-notes`
- `/api/queue`
- `/api/cases`
- `/api/inventory`
- `/api/users`
- `/api/reports`

Operational endpoints:

- `GET /health`
- `GET /api`
- static uploads at `/uploads`

## 4. Frontend Integration Surface

The frontend router currently exposes these authenticated pages:

- `/` dashboard
- `/patients`
- `/patients/:id`
- `/queue`
- `/cases`
- `/reports`
- `/materials`
- `/requests/approvals`
- `/settings`
- `/admin/users`
- `/admin/audit-logs`

Role-gated navigation currently matches the shipped UI:

- All signed-in users: dashboard, patients, settings
- Admin, orthodontist, dental surgeon, student, nurse, reception: clinic queue
- Admin, orthodontist, dental surgeon, student: student cases
- Admin only: reports, user management, audit log
- Admin and nurse: materials/inventory
- Orthodontist and dental surgeon: request approvals

Important current implementation detail:

- The frontend API base URL is hardcoded to `http://localhost:3000` in `Frontend/src/app/config/api.ts`
- The frontend only uses `.env` for `VITE_GOOGLE_CLIENT_ID`
- For any non-localhost deployment, the frontend API base must be changed in code unless a reverse proxy preserves that backend origin

## 5. Core Implemented Domains

Current end-to-end domains in the codebase:

- authentication and token refresh
- user management with admin-created accounts and password reset email flow
- patient directory with filters, inactive/reactivate flow, and assignment management
- pending assignment approval workflow for orthodontists and dental surgeons
- patient profile tabs for overview, visits, patient history, dental chart, documents, diagnosis, and treatment plan/notes
- visit scheduling and reminder sending
- clinic queue management
- student case tracking
- inventory/materials management with stock updates and restore flow
- reports dashboard for admin
- audit log browsing for admin

## 6. Security and Access Model

Current security behavior in the running system:

- `helmet`, `cors`, `compression`, and request logging are enabled
- JWT access and refresh tokens are used
- inactivity timeout is enforced with `SESSION_TIMEOUT_SECONDS`
- users flagged with `must_change_password` are forced to `/settings`
- auth routes use stricter rate limiting
- object-level access checks are enforced through `Backend/src/middleware/accessControl.js`

Notable current access behavior:

- inventory mutation routes are restricted to `NURSE`
- admin can manage users and read reports/audit logs
- receptionist workflows focus on patient-general and appointment operations
- orthodontist and dental surgeon workflows are assignment-aware
- diagnosis and treatment access differs by role and patient assignment

## 7. Required Environment Configuration

Backend environment comes from `Backend/.env`.
Use `Backend/.env.example` as the source of truth.

Minimum backend values:

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

CORS_ORIGIN=http://localhost:5173
GOOGLE_CLIENT_ID=your_google_client_id.apps.googleusercontent.com

EMAIL_SIMULATION=true
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=your_email
SMTP_PASS=your_app_password
SMTP_FROM=your_email
```

Other active backend settings supported today:

- `AUDIT_LOG_RETENTION_*`
- `UPLOAD_DIR`
- `MAX_FILE_SIZE`
- `ALLOWED_FILE_TYPES`
- `RATE_LIMIT_WINDOW_MS`
- `RATE_LIMIT_MAX_REQUESTS`
- `LOG_LEVEL`

Frontend environment:

```env
VITE_GOOGLE_CLIENT_ID=your_google_client_id.apps.googleusercontent.com
```

## 8. Local Full-Stack Startup

### Backend

From `Backend/`:

```bash
npm install
cp .env.example .env
npm run migrate
npm run seed
npm run dev
```

Notes:

- `npm run migrate` prepares the schema
- `npm run seed` clears existing seeded tables and reloads baseline data
- `npm run dev` currently runs `node server.js`

### Frontend

From `Frontend/`:

```bash
npm install
cp .env.example .env
npm run dev
```

### Two-terminal startup

```bash
cd Backend && npm run dev
cd Frontend && npm run dev
```

### Helper script

From repo root:

```bash
./start-orthoflow.sh
```

Current helper-script behavior:

- reuses existing listeners on ports `3000` and `5173`
- waits for backend `/health`
- waits for frontend root page
- opens the frontend in the default browser
- stops child processes on `Ctrl+C`

## 9. Seeded Local Accounts

`Backend/scripts/seed.js` currently creates these baseline users:

- `admin@orthoflow.edu` / `admin123`
- `sarah.johnson@orthoflow.edu` / `doctor123`
- `michael.chen@orthoflow.edu` / `doctor123`
- `emily.wilson@orthoflow.edu` / `nurse123`
- `alex.thompson@orthoflow.edu` / `student123`
- `maria.garcia@orthoflow.edu` / `student123`
- `lisa.brown@orthoflow.edu` / `reception123`

## 10. Google Sign-In

Google login is implemented but only works when both sides use a valid client ID.

Required setup:

1. Create a Google OAuth web client.
2. Add `http://localhost:5173` to authorized JavaScript origins.
3. Put the same client ID in:
   - `Backend/.env` as `GOOGLE_CLIENT_ID`
   - `Frontend/.env` as `VITE_GOOGLE_CLIENT_ID`

Current backend behavior:

- validates Google ID token audience against `GOOGLE_CLIENT_ID`
- accepts comma-separated backend client IDs if needed

## 11. Email and Reminder Integration

Current reminder/email behavior:

- manual reminder sending exists on visit routes
- automatic reminder background job starts with the backend
- `EMAIL_SIMULATION=true` keeps email flows non-destructive for local runs
- setting `EMAIL_SIMULATION=false` requires valid `SMTP_*` settings

Admin account creation and password reset flows also use email service logic.

## 12. File Uploads and Dental Chart PDFs

Current document handling:

- uploads are served from `Backend/src/uploads`
- file constraints are controlled by backend env
- document delete and restore flows are implemented

Dental chart PDF behavior:

- visual PDF generation can use Playwright/Chromium when available
- fallback PDF generation is used when Chromium is unavailable

Optional setup for visual PDF output:

```bash
cd Backend
npm i playwright
npx playwright install chromium
```

## 13. Verification Checklist

Minimum integration verification after startup:

1. Open `http://localhost:3000/health`
2. Open `http://localhost:5173`
3. Sign in with a seeded account
4. Confirm dashboard data loads
5. Open `/patients` and a patient profile
6. Confirm queue, materials, or reports based on role
7. If Google Sign-In is configured, verify the Google button renders and sign-in completes

## 14. Regression Coverage

Repository-root test coverage includes API and Playwright scripts such as:

- auth and RBAC
- patient management
- appointments and reminders
- dental chart versions
- document upload and trash flows
- audit log APIs and page
- dashboard, queue, materials, reports, and settings flows

Run the full suite from repo root:

```bash
node test-run-all-valid.js
```

Latest report output path:

- `test-report-full-latest.txt`

## 15. Current Constraints

These are important for anyone treating this as the latest deployment guide:

- this repository does not currently include Docker, PM2, or reverse-proxy deployment config
- the frontend API base is hardcoded to `http://localhost:3000`
- `npm run seed` is destructive for seeded application tables
- backend development startup auto-opens `/api` in development mode
- `start-orthoflow.sh` is best suited to local development on a machine matching the repository path used in the script
