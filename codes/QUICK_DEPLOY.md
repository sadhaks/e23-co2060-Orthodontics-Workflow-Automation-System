# OrthoFlow Quick Deployment

This is the shortest accurate setup path for the current repository version.

## 1. What This Guide Covers

This guide is for bringing up the current system on a local or single-machine environment.

It assumes:

- Node.js 18+ is installed
- npm is installed
- MySQL 8+ is installed and running

## 2. Backend Boot

```bash
cd "/Users/rahulkulasooriya/Downloads/Orthodontics Workflow Automation System/Backend"
npm install
cp .env.example .env
```

Edit `Backend/.env` at minimum:

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
```

Initialize and start:

```bash
npm run migrate
npm run seed
npm run dev
```

Important:

- `npm run seed` clears and reloads core application data
- the backend should be reachable at `http://localhost:3000`
- health check should return JSON at `http://localhost:3000/health`

## 3. Frontend Boot

```bash
cd "/Users/rahulkulasooriya/Downloads/Orthodontics Workflow Automation System/Frontend"
npm install
cp .env.example .env
```

Set:

```env
VITE_GOOGLE_CLIENT_ID=your_google_client_id.apps.googleusercontent.com
```

Start:

```bash
npm run dev
```

Frontend URL:

- `http://localhost:5173`

## 4. Important Current Constraint

The frontend API base is currently hardcoded in `Frontend/src/app/config/api.ts` to:

```ts
BASE_URL: 'http://localhost:3000'
```

So if you deploy the backend anywhere else, you must update that file or place the app behind infrastructure that still exposes the API at that origin.

## 5. Fast Local Start

From repo root:

```bash
./start-orthoflow.sh
```

Current helper behavior:

- reuses ports `3000` and `5173` if already running
- waits for backend health and frontend readiness
- opens the frontend in a browser
- stops managed child processes on `Ctrl+C`

## 6. Login After Seeding

Default seeded accounts include:

- `admin@orthoflow.edu` / `admin123`
- `sarah.johnson@orthoflow.edu` / `doctor123`
- `michael.chen@orthoflow.edu` / `doctor123`
- `emily.wilson@orthoflow.edu` / `nurse123`
- `alex.thompson@orthoflow.edu` / `student123`
- `maria.garcia@orthoflow.edu` / `student123`
- `lisa.brown@orthoflow.edu` / `reception123`

## 7. Google Sign-In

Google Sign-In is optional for local boot, but if you want it working:

1. Create a Google OAuth web client.
2. Add `http://localhost:5173` as an authorized JavaScript origin.
3. Use the same client ID in:
   - `Backend/.env` as `GOOGLE_CLIENT_ID`
   - `Frontend/.env` as `VITE_GOOGLE_CLIENT_ID`

If `VITE_GOOGLE_CLIENT_ID` is missing, the Google button will not initialize.

## 8. Real Email Sending

For local-safe runs, keep:

```env
EMAIL_SIMULATION=true
```

For real SMTP sending, change to:

```env
EMAIL_SIMULATION=false
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=your_email
SMTP_PASS=your_app_password
SMTP_FROM=your_email
```

This affects reminder emails and admin password email flows.

## 9. Optional Visual PDF Support

For dental-chart visual PDF rendering:

```bash
cd "/Users/rahulkulasooriya/Downloads/Orthodontics Workflow Automation System/Backend"
npm i playwright
npx playwright install chromium
```

Without Chromium, the system falls back automatically.

## 10. Quick Verification

Check these after startup:

1. `http://localhost:3000/health`
2. `http://localhost:5173`
3. sign in with a seeded account
4. open patients, queue, or materials depending on role
5. for admin, verify reports and audit log pages load

## 11. Full Regression

From repo root:

```bash
node test-run-all-valid.js
```

Report output:

- `test-report-full-latest.txt`
