# OrthoFlow Backend

Express + MySQL backend for the Orthodontics Workflow Automation System.

## Stack

- Node.js
- Express
- MySQL (`mysql2`)
- JWT auth (access + refresh tokens)
- Joi validation
- Multer uploads

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

## Environment

Use `Backend/.env.example` as the source of truth.

Important variables:

- `DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASSWORD`, `DB_NAME`
- `JWT_SECRET`, `JWT_REFRESH_SECRET`, `JWT_EXPIRE`, `JWT_REFRESH_EXPIRE`
- `SESSION_TIMEOUT_SECONDS`
- `GOOGLE_CLIENT_ID`
- `EMAIL_SIMULATION`, `SMTP_*`
- `AUDIT_LOG_RETENTION_*`
- `CORS_ORIGIN`

## API Roots

- API index: `GET /api`
- Auth: `/api/auth`
- Patients: `/api/patients`
- Visits: `/api/visits`
- Documents: `/api/documents`
- Clinical notes: `/api/clinical-notes`
- Queue: `/api/queue`
- Cases: `/api/cases`
- Inventory: `/api/inventory`
- Users: `/api/users`
- Reports: `/api/reports`

## Current Behavior Highlights

- Session inactivity timeout enforced (`SESSION_TIMEOUT_SECONDS`, default `3600`)
- Google Sign-In uses Google tokeninfo audience validation against `GOOGLE_CLIENT_ID`
- Audit retention job and auto-reminder job start with the server
- Inventory supports soft delete + restore + permanent delete flow
- Dental chart versions support chronological saves, PDF download, and orthodontist-only bin management

## Scripts

```bash
npm run dev       # start development server
npm start         # start server
npm run migrate   # apply DB migrations
npm run seed      # seed baseline data
```

## Testing

Project-level regression scripts are in repository root.

From root:

```bash
node test-run-all-valid.js
```

## Notes

For visual dental chart version PDF exports (HTML -> Chromium PDF), install Playwright in backend runtime:

```bash
cd Backend
npm i playwright
npx playwright install chromium
```

Fallback PDF generation is used automatically if Chromium is unavailable.
