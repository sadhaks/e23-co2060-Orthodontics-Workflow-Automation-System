# Local Development

This guide explains how to run the system on a developer machine.

## Requirements

Install:

- Node.js 20 or newer
- npm
- MySQL
- Git

For local dental chart PDF testing, the backend may need Playwright browser dependencies. The production Docker image already includes these.

## Backend Setup

Go to the backend folder:

```bash
cd codes/Backend
```

Install dependencies:

```bash
npm install
```

Create a local `.env` file in `codes/Backend`.

Minimum local example:

```env
NODE_ENV=development
PORT=3000

DB_HOST=localhost
DB_PORT=3306
DB_USER=root
DB_PASSWORD=your_mysql_password
DB_NAME=orthoflow

SEED_ADMIN_NAME=System Administrator
SEED_ADMIN_EMAIL=admin@example.com
SEED_ADMIN_DEPARTMENT=Orthodontics
SEED_ADMIN_PASSWORD=change_this_password

JWT_SECRET=replace_with_long_random_secret
JWT_REFRESH_SECRET=replace_with_another_long_random_secret
JWT_EXPIRE=24h
JWT_REFRESH_EXPIRE=7d
SESSION_TIMEOUT_SECONDS=3600

GOOGLE_CLIENT_ID=your_google_client_id.apps.googleusercontent.com

EMAIL_SIMULATION=true
REMINDER_AUTO_SCAN_MS=10000
REMINDER_AUTO_WINDOW_HOURS=48
REMINDER_MAX_CONCURRENT=3

UPLOAD_DIR=./src/uploads
MAX_FILE_SIZE=104857600
ALLOWED_FILE_TYPES=jpg,jpeg,png,pdf,doc,docx

RATE_LIMIT_WINDOW_MS=900000
RATE_LIMIT_MAX_REQUESTS=100
CORS_ORIGIN=http://localhost:5173
```

Create/update database schema:

```bash
npm run bootstrap-db
```

Ensure the first admin exists:

```bash
npm run ensure-admin
```

Start the backend:

```bash
npm run dev
```

Default backend URL:

```text
http://localhost:3000
```

Health check:

```text
http://localhost:3000/health
```

## Frontend Setup

Open a second terminal and go to the frontend folder:

```bash
cd codes/Frontend
```

Install dependencies:

```bash
npm install
```

Create a local `.env` file in `codes/Frontend`:

```env
VITE_API_BASE_URL=http://localhost:3000
VITE_GOOGLE_CLIENT_ID=your_google_client_id.apps.googleusercontent.com
```

Start the frontend:

```bash
npm run dev
```

Default frontend URL:

```text
http://localhost:5173
```

## Local Email Testing

For normal local development, keep:

```env
EMAIL_SIMULATION=true
```

Also leave `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, and `SMTP_PASS` unset. This causes the backend to log simulated emails instead of sending them. A complete SMTP configuration takes precedence and sends real email even when `EMAIL_SIMULATION=true`.

To test real email sending locally, provide complete SMTP settings and preferably set `EMAIL_SIMULATION=false` so missing SMTP configuration fails clearly. See [Environment Variables](environment-variables.md).

## Common Local Problems

### Frontend cannot reach backend

Check:

- backend is running
- `VITE_API_BASE_URL=http://localhost:3000`
- backend `CORS_ORIGIN=http://localhost:5173`

### Google Sign-In does not appear

Check:

- `VITE_GOOGLE_CLIENT_ID` is set in frontend `.env`
- `GOOGLE_CLIENT_ID` is set in backend `.env`
- frontend was restarted after editing `.env`

### Database connection fails

Check:

- MySQL is running
- database name exists
- username/password are correct
- `.env` is in `codes/Backend`
