# OrthoFlow Backend

Express + MySQL backend for the current Orthodontics Workflow Automation System.

## Stack

- Node.js
- Express
- MySQL via `mysql2`
- JWT access and refresh tokens
- Joi validation
- Multer uploads
- Nodemailer email delivery or simulation

## Run Locally

```bash
cd Backend
npm install
cp .env.example .env
npm run migrate
npm run seed
npm run dev
```

Health check:

```bash
curl http://localhost:3000/health
```

Important:

- `npm run seed` clears and reloads core application tables
- `npm run dev` currently runs `node server.js`

## Environment

Use `Backend/.env.example` as the source of truth.

Important variables:

- `DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASSWORD`, `DB_NAME`
- `JWT_SECRET`, `JWT_REFRESH_SECRET`, `JWT_EXPIRE`, `JWT_REFRESH_EXPIRE`
- `SESSION_TIMEOUT_SECONDS`
- `GOOGLE_CLIENT_ID`
- `EMAIL_SIMULATION`, `SMTP_*`
- `AUDIT_LOG_RETENTION_*`
- `UPLOAD_DIR`, `MAX_FILE_SIZE`, `ALLOWED_FILE_TYPES`
- `RATE_LIMIT_WINDOW_MS`, `RATE_LIMIT_MAX_REQUESTS`
- `CORS_ORIGIN`

## API Roots

- API index: `GET /api`
- health: `GET /health`
- auth: `/api/auth`
- patients: `/api/patients`
- visits: `/api/visits`
- documents: `/api/documents`
- clinical notes: `/api/clinical-notes`
- queue: `/api/queue`
- cases: `/api/cases`
- inventory: `/api/inventory`
- users: `/api/users`
- reports: `/api/reports`

## Current Behavior Highlights

- DB connection test runs on startup
- access-control schema checks run on startup
- audit retention job starts with the server
- automatic reminder job starts with the server
- session inactivity timeout is enforced
- Google Sign-In uses backend audience validation against `GOOGLE_CLIENT_ID`
- inventory supports restore flow and transaction-safe deletion behavior
- dental-chart version workflows support download and orthodontist-managed bin actions

## Scripts

```bash
npm run dev
npm start
npm run migrate
npm run seed
```

## Seeded Local Accounts

Current seed script creates:

- `admin@orthoflow.edu` / `admin123`
- `sarah.johnson@orthoflow.edu` / `doctor123`
- `michael.chen@orthoflow.edu` / `doctor123`
- `emily.wilson@orthoflow.edu` / `nurse123`
- `alex.thompson@orthoflow.edu` / `student123`
- `maria.garcia@orthoflow.edu` / `student123`
- `lisa.brown@orthoflow.edu` / `reception123`

## Testing

Project-level regression scripts live at repository root.

Run full validation from root:

```bash
node test-run-all-valid.js
```

## Notes

For visual dental-chart PDF exports with Chromium:

```bash
cd Backend
npm i playwright
npx playwright install chromium
```

Fallback PDF behavior is used automatically if Chromium is unavailable.
