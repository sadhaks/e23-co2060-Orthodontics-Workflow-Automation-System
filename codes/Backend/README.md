# OrthoFlow Backend

Node.js and Express backend for the Orthodontics Workflow Automation System.

## What the Backend Does

The backend provides:

- authentication and Google Sign-In verification
- user, role, session, and password management
- patient records and care-team assignment workflows
- visits, reminders, and clinic queue management
- dental chart data and graphical PDF generation
- patient documents and file downloads
- diagnosis, treatment notes, payment records, and material usage
- inventory management
- student case tracking
- admin reports and audit logs

## Stack

- Node.js 20+
- Express
- MySQL through `mysql2`
- JWT access and refresh tokens
- Joi validation
- Multer uploads
- Nodemailer SMTP email
- Cloudflare R2 or another S3-compatible object store
- Playwright/Chromium for dental chart PDF rendering

## Local Development

From this folder:

```bash
npm install
npm run bootstrap-db
npm run ensure-admin
npm run dev
```

Default local backend URL:

```text
http://localhost:3000
```

Health check:

```bash
curl http://localhost:3000/health
```

## Scripts

```bash
npm start
npm run dev
npm run bootstrap-db
npm run ensure-admin
npm run reset-admin-password
npm run migrate
npm run seed
```

Use `bootstrap-db` and `ensure-admin` for normal setup.

Use `migrate` and `seed` only for controlled development resets. They are not the normal production maintenance path.

## Environment Variables

Create `codes/Backend/.env` for local development. In Render, set the runtime values in the backend service environment. The `SEED_ADMIN_*` values are only read by the setup scripts and are not required by the normal server process after the first admin has been created.

Main groups:

- server: `PORT`, `NODE_ENV`
- database: `DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASSWORD`, `DB_NAME`, `DB_SSL`, `DB_SSL_REJECT_UNAUTHORIZED`, `DB_SSL_CA`
- admin seed: `SEED_ADMIN_NAME`, `SEED_ADMIN_EMAIL`, `SEED_ADMIN_DEPARTMENT`, `SEED_ADMIN_PASSWORD`
- auth: `JWT_SECRET`, `JWT_REFRESH_SECRET`, `JWT_EXPIRE`, `JWT_REFRESH_EXPIRE`, `SESSION_TIMEOUT_SECONDS`
- Google: `GOOGLE_CLIENT_ID`
- file storage: `FILE_STORAGE_PROVIDER`, `UPLOAD_DIR`, `R2_*` or `S3_*`
- email: `EMAIL_SIMULATION`, `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM`
- automatic reminders: `REMINDER_AUTO_SCAN_MS`, `REMINDER_AUTO_WINDOW_HOURS`, `REMINDER_MAX_CONCURRENT`
- rate limiting and CORS: `RATE_LIMIT_WINDOW_MS`, `RATE_LIMIT_MAX_REQUESTS`, `CORS_ORIGIN`
- audit retention: `AUDIT_LOG_RETENTION_*`

See `../../docs/environment-variables.md` for the full handover reference.

## Database Behavior

The backend connects to MySQL at startup and applies runtime schema guards from `src/config/database.js`.

These guards add selected newer tables and columns to an already initialized OrthoFlow database. They do not create the core schema in a fresh database and do not replace database backups.

For a new production database, initialize it once from a trusted administrative machine before the first backend deployment. From the repository root:

```bash
cd codes/Backend
npm ci
npm run bootstrap-db
npm run ensure-admin
```

Run `bootstrap-db` only after confirming that `DB_NAME` identifies the intended new/empty OrthoFlow database. For an existing production database, take a backup first and rely on the startup guards for supported incremental changes.

For cloud deployment, Aiven MySQL should be configured with SSL enabled:

```env
DB_SSL=true
DB_SSL_REJECT_UNAUTHORIZED=true
DB_SSL_CA=<aiven-ca-certificate>
```

## File Storage

Local development can use local disk storage.

Production should use Cloudflare R2:

```env
FILE_STORAGE_PROVIDER=r2
R2_BUCKET=orthoflow-documents
R2_ENDPOINT=https://<account-id>.r2.cloudflarestorage.com
R2_ACCESS_KEY_ID=<access-key-id>
R2_SECRET_ACCESS_KEY=<secret-access-key>
R2_REGION=auto
R2_FORCE_PATH_STYLE=true
UPLOAD_DIR=/tmp/uploads
```

The backend stores object keys and metadata in MySQL. R2 stores the actual uploaded file bytes.

## Email

The backend sends emails through SMTP using Nodemailer.

Supported provider examples:

- SMTP2GO: `mail.smtp2go.com`, usually port `2525`
- Brevo: `smtp-relay.brevo.com`, usually port `587`

For local simulation, set `EMAIL_SIMULATION=true` and leave the SMTP connection variables unset. With the current implementation, a complete SMTP configuration takes precedence and sends real email even when `EMAIL_SIMULATION=true`.

## Docker Deployment

Production backend deployment on Render should use Docker:

```text
codes/Backend/Dockerfile
```

The Docker image is based on Microsoft Playwright so Chromium is available for graphical dental chart PDF rendering.

Render settings:

- Runtime: Docker
- Root directory: `codes/Backend`
- Dockerfile path: `./Dockerfile`
- Health check path: `/health`

## API Roots

- `GET /`
- `GET /health`
- `GET /api`
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
