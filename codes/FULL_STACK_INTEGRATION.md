# OrthoFlow Full-Stack Integration Reference

This document describes how the current frontend, backend, database, file storage, and email services work together.

For handover-level instructions, start with:

- `../README.md`
- `../docs/README.md`
- `../docs/system-overview.md`
- `../docs/cloud-deployment.md`
- `../docs/operations-maintenance.md`

## Current Stack

- Frontend: React, TypeScript, Vite
- Backend: Node.js, Express, MySQL
- Database: MySQL, usually hosted on Aiven for cloud deployments
- File storage: Cloudflare R2 through an S3-compatible API
- Email: SMTP through SMTP2GO or Brevo
- PDF rendering: Playwright/Chromium in the backend Docker image
- Authentication: email/password, Google Sign-In, JWT access tokens, refresh tokens, inactivity timeout

## Repository Layout

```text
codes/
├── Backend/
│   ├── Dockerfile
│   ├── server.js
│   ├── database-schema.sql
│   ├── scripts/
│   └── src/
│       ├── config/
│       ├── controllers/
│       ├── middleware/
│       ├── routes/
│       └── services/
├── Frontend/
│   ├── index.html
│   ├── package.json
│   ├── vite.config.ts
│   └── src/app/
├── FULL_STACK_INTEGRATION.md
├── PRODUCTION_DEPLOYMENT_RUNBOOK.md
└── QUICK_DEPLOY.md
```

There is no single repository-level startup script in the current handover path. Run backend and frontend commands from their own folders.

## Backend Integration Surface

The backend starts from `codes/Backend/server.js`.

Startup responsibilities:

- load environment variables
- enable security, CORS, compression, logging, and JSON parsing middleware
- trust the Render proxy for rate limiting and client IP handling
- connect to MySQL
- apply runtime schema guards
- start audit retention cleanup
- start automatic reminder processing
- serve API routes and health checks

Main API roots:

- `/api/auth`
- `/api/patients`
- `/api/visits`
- `/api/documents`
- `/api/clinical-notes`
- `/api/payment-records`
- `/api/patient-materials`
- `/api/queue`
- `/api/cases`
- `/api/inventory`
- `/api/users`
- `/api/reports`

Operational endpoints:

- `GET /`
- `GET /health`
- `GET /api`

## Frontend Integration Surface

The frontend application router is in:

```text
codes/Frontend/src/app/App.tsx
```

Main routes:

- `/login`
- `/`
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

The Student Cases route is available to admins, orthodontists, dental surgeons, and students. Orthodontists can assign patients to dental surgeons and students; dental surgeons can assign their patients to students and supervise those student cases. Admins can monitor progress and delete removed student cases for cleanup, while task progress and review actions remain supervisor/student workflows.

The frontend API base URL is read from:

```env
VITE_API_BASE_URL
```

If the value is not set, local development falls back to:

```text
http://localhost:3000
```

Google Sign-In uses:

```env
VITE_GOOGLE_CLIENT_ID
```

The backend must use the same Google client ID in:

```env
GOOGLE_CLIENT_ID
```

## Database Integration

The backend uses MySQL through `mysql2`.

For cloud deployments, Aiven MySQL is currently the recommended managed database. SSL is supported through:

```env
DB_SSL=true
DB_SSL_REJECT_UNAUTHORIZED=true
DB_SSL_CA=-----BEGIN CERTIFICATE-----\n...\n-----END CERTIFICATE-----
```

The backend runs non-destructive schema guards on startup. These guards add selected newer tables and columns to an already initialized OrthoFlow database; they do not create the core schema in a fresh database.

For a new database, configure the production database variables and the intended `SEED_ADMIN_*` values on a trusted administrative machine, then run these commands once from the repository root before the first backend deployment:

```bash
cd codes/Backend
npm ci
npm run bootstrap-db
npm run ensure-admin
```

Confirm that the target database is new/empty before running `bootstrap-db`. Back up an existing database before any schema operation.

MySQL stores structured system data:

- users, roles, refresh tokens, password state
- patients and care-team assignments
- assignment requests and approval status
- visits and queue entries
- dental chart records and version metadata
- document metadata and storage keys
- diagnosis, treatment notes, payments, inventory, material usage
- student cases, case progress, and case tasks
- audit logs and system settings

Uploaded file bytes should not be stored in MySQL for production. They should be stored in Cloudflare R2.

## File Storage Integration

The backend file storage abstraction supports local storage and S3-compatible storage.

For production, use:

```env
FILE_STORAGE_PROVIDER=r2
R2_BUCKET=orthoflow-documents
R2_ENDPOINT=https://<cloudflare-account-id>.r2.cloudflarestorage.com
R2_ACCESS_KEY_ID=...
R2_SECRET_ACCESS_KEY=...
R2_REGION=auto
R2_FORCE_PATH_STYLE=true
UPLOAD_DIR=/tmp/uploads
```

The database stores the R2 object metadata. The bucket can remain private because users download files through authenticated backend endpoints.

Local upload paths are only suitable for local development or temporary processing.

## Email Integration

The backend sends email through SMTP using Nodemailer. The code does not depend on a specific SMTP provider.

SMTP2GO example:

```env
EMAIL_SIMULATION=false
SMTP_HOST=mail.smtp2go.com
SMTP_PORT=2525
SMTP_SECURE=false
SMTP_USER=<smtp2go-smtp-username>
SMTP_PASS=<smtp2go-smtp-password>
SMTP_FROM=no-reply@dental.pdn.ac.lk
```

Brevo example:

```env
EMAIL_SIMULATION=false
SMTP_HOST=smtp-relay.brevo.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=<brevo-login>
SMTP_PASS=<brevo-smtp-key>
SMTP_FROM=orthoflow97@gmail.com
```

The sender address must be verified in the provider account. For final production, a faculty-controlled sender such as `no-reply@dental.pdn.ac.lk` is preferable.

## PDF Rendering Integration

Dental chart PDFs use backend-side rendering. The Render backend should be deployed as a Docker web service using:

```text
codes/Backend/Dockerfile
```

The Docker image is based on the Microsoft Playwright image so Chromium is available in production. This is important for graphical dental chart PDFs with colors and layout.

If the backend is deployed as a plain Node service without Chromium, PDF output may fall back to a simpler text-oriented format.

## Local Development Commands

Backend:

```bash
cd codes/Backend
npm install
npm run bootstrap-db
npm run ensure-admin
npm run dev
```

Frontend:

```bash
cd codes/Frontend
npm install
npm run dev
```

Default local URLs:

- backend: `http://localhost:3000`
- frontend: `http://localhost:5173`

## Production Deployment Summary

Recommended cloud services:

- Render Static Site for frontend
- Render Docker Web Service for backend
- Aiven MySQL for database
- Cloudflare R2 for uploaded patient documents and images
- SMTP2GO or Brevo for email delivery
- Google Cloud OAuth client for Google Sign-In

Deployment order:

1. Create stakeholder-owned accounts.
2. Fork the parent repository.
3. Create Aiven MySQL.
4. Initialize the new MySQL schema and first admin once.
5. Create Cloudflare R2 bucket and token.
6. Configure email provider.
7. Create Render backend service.
8. Create Render frontend service.
9. Update CORS and frontend API URL.
10. Update Google OAuth origins.
11. Deploy backend, deploy frontend, test full workflows.
