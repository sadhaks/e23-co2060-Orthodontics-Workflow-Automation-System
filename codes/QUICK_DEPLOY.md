# OrthoFlow Quick Deploy (One Page)

Use this checklist to deploy OrthoFlow quickly on a new local machine.

## 1. Install Prerequisites

- Node.js 18+
- npm
- MySQL 8+

## 2. Backend Setup

```bash
cd "Orthodontics Workflow Automation System/Backend"
npm install
cp .env.example .env
```

Edit `Backend/.env` minimum values:

```env
PORT=3000
DB_HOST=localhost
DB_PORT=3306
DB_USER=your_user
DB_PASSWORD=your_password
DB_NAME=orthoflow

JWT_SECRET=change_this
JWT_REFRESH_SECRET=change_this
SESSION_TIMEOUT_SECONDS=3600

CORS_ORIGIN=http://localhost:5173

GOOGLE_CLIENT_ID=your_google_client_id.apps.googleusercontent.com

EMAIL_SIMULATION=true
# set EMAIL_SIMULATION=false + SMTP_* for real email sending
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

## 3. Frontend Setup

```bash
cd "../Frontend"
npm install
cp .env.example .env
```

Set:

```env
VITE_GOOGLE_CLIENT_ID=your_google_client_id.apps.googleusercontent.com
```

Start frontend:

```bash
npm run dev
```

## 4. Verify URLs

- Frontend: `http://localhost:5173`
- Backend health: `http://localhost:3000/health`
- API root: `http://localhost:3000/api`

## 5. Google Sign-In (Required for real Google login)

In Google Cloud Console:

- Create OAuth Client ID (Web app)
- Add authorized JS origins:
  - `http://localhost:5173`
  - your production frontend URL
- Use same client ID in backend + frontend env

## 6. Real Email Sending (Optional)

In `Backend/.env`:

- `EMAIL_SIMULATION=false`
- set valid `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM`

## 7. Visual Dental Chart Version PDF (Optional)

For visual chart-style PDF generation:

```bash
cd "../Backend"
npm i playwright
npx playwright install chromium
```

If not installed, system falls back to non-visual PDF automatically.

## 8. Run Full Regression

From repo root:

```bash
node test-run-all-valid.js
```

Report output:

- `test-report-full-latest.txt`

## 9. Fast Start Command (macOS helper)

From repo root:

```bash
./start-orthoflow.sh
```
