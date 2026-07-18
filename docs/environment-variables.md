# Environment Variables

This document lists the main environment variables used by the system.

Do not commit real `.env` files or secrets to GitHub.

## Backend Variables

Backend folder:

```text
codes/Backend
```

### Server

| Variable | Purpose |
| --- | --- |
| `NODE_ENV` | `development` locally, `production` on Render |
| `PORT` | API server port. Render commonly uses `10000` |

### Database

| Variable | Purpose |
| --- | --- |
| `DB_HOST` | MySQL host |
| `DB_PORT` | MySQL port |
| `DB_USER` | MySQL username |
| `DB_PASSWORD` | MySQL password |
| `DB_NAME` | MySQL database name |
| `DB_SSL` | Set `true` for Aiven |
| `DB_SSL_REJECT_UNAUTHORIZED` | Set `true` for Aiven |
| `DB_SSL_CA` | Aiven CA certificate |

### First Admin

These are used by admin setup scripts:

| Variable | Purpose |
| --- | --- |
| `SEED_ADMIN_NAME` | Initial admin display name |
| `SEED_ADMIN_EMAIL` | Initial admin email |
| `SEED_ADMIN_DEPARTMENT` | Initial admin department |
| `SEED_ADMIN_PASSWORD` | Initial admin password |

### Authentication

| Variable | Purpose |
| --- | --- |
| `JWT_SECRET` | Long random JWT secret |
| `JWT_REFRESH_SECRET` | Long random refresh-token secret |
| `JWT_EXPIRE` | Access token lifetime, for example `24h` |
| `JWT_REFRESH_EXPIRE` | Refresh token lifetime, for example `7d` |
| `SESSION_TIMEOUT_SECONDS` | Idle timeout, for example `3600` |
| `GOOGLE_CLIENT_ID` | Google OAuth web client ID; the backend accepts a comma-separated list of allowed client IDs, while the frontend uses one client ID |

### Audit Log Retention

| Variable | Typical Value |
| --- | --- |
| `AUDIT_LOG_RETENTION_ENABLED` | `true` |
| `AUDIT_LOG_RETENTION_DAYS` | `180` |
| `AUDIT_LOG_CLEANUP_INTERVAL_HOURS` | `24` |
| `AUDIT_LOG_CLEANUP_BATCH_SIZE` | `5000` |
| `AUDIT_LOG_ARCHIVE_BEFORE_DELETE` | `false` |

By default, the retention job runs every 24 hours and deletes `audit_logs` rows older than 180 days in batches of 5,000. When `AUDIT_LOG_ARCHIVE_BEFORE_DELETE=true`, each batch is copied to the `audit_logs_archive` table before the original rows are deleted. The archive table is created automatically when archiving is enabled.

### Automatic Appointment Reminders

The automatic reminder job starts with the backend. These variables control its polling and concurrency behavior:

| Variable | Default | Purpose |
| --- | --- | --- |
| `REMINDER_AUTO_SCAN_MS` | `10000` | Interval between scans for upcoming scheduled visits |
| `REMINDER_AUTO_WINDOW_HOURS` | `48` | How far ahead to search for appointments |
| `REMINDER_MAX_CONCURRENT` | `3` | Maximum reminder jobs processed concurrently |

For local simulation, set `EMAIL_SIMULATION=true` and leave the SMTP connection variables unset. With the current implementation, a complete SMTP configuration takes precedence and sends real email even when `EMAIL_SIMULATION=true`. Simulated reminders are still recorded as processed.

### Uploads

| Variable | Default | Purpose |
| --- | --- | --- |
| `UPLOAD_DIR` | `./src/uploads` | Temporary/local upload folder |
| `MAX_FILE_SIZE` | `10485760` | Maximum upload size in bytes (10 MiB by default) |
| `ALLOWED_FILE_TYPES` | `*` | Comma-separated allowed upload extensions; `*` permits all extensions |

Local development can use:

```env
UPLOAD_DIR=./src/uploads
```

Production with Cloudflare R2 should use:

```env
UPLOAD_DIR=/tmp/uploads
```

### Cloudflare R2

```env
FILE_STORAGE_PROVIDER=r2
R2_ENDPOINT=https://ACCOUNT_ID.r2.cloudflarestorage.com
R2_BUCKET=orthoflow-documents
R2_ACCESS_KEY_ID=your_r2_access_key_id
R2_SECRET_ACCESS_KEY=your_r2_secret_access_key
R2_REGION=auto
R2_FORCE_PATH_STYLE=true
```

Alternative:

```env
R2_ACCOUNT_ID=your_cloudflare_account_id
```

If `R2_ENDPOINT` is set, it is used directly.

For another S3-compatible provider, use `FILE_STORAGE_PROVIDER=s3` and the corresponding `S3_ENDPOINT`, `S3_BUCKET`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`, `S3_REGION`, and `S3_FORCE_PATH_STYLE` variables. When both naming schemes are present, the `S3_*` value takes precedence over the matching `R2_*` value.

### SMTP2GO Email

`EMAIL_SIMULATION` controls what happens only when a complete SMTP transport is unavailable: `true` logs a simulated email, while `false` raises a configuration error. It does not override a complete SMTP configuration.

```env
EMAIL_SIMULATION=false
SMTP_HOST=mail.smtp2go.com
SMTP_PORT=2525
SMTP_SECURE=false
SMTP_USER=your_smtp2go_smtp_username
SMTP_PASS=your_smtp2go_smtp_password
SMTP_FROM=no-reply@dental.pdn.ac.lk
```

`SMTP_USER` and `SMTP_PASS` must be SMTP2GO SMTP credentials, not the SMTP2GO web login password.

### Brevo Email

```env
EMAIL_SIMULATION=false
SMTP_HOST=smtp-relay.brevo.com
SMTP_PORT=2525
SMTP_SECURE=false
SMTP_USER=your_brevo_smtp_login
SMTP_PASS=your_brevo_smtp_key
SMTP_FROM=no-reply@dental.pdn.ac.lk
```

Brevo may show port `587`. If Render times out on `587`, use `2525` with `SMTP_SECURE=false`. If needed, try:

```env
SMTP_PORT=465
SMTP_SECURE=true
```

`SMTP_PASS` must be a Brevo SMTP key, not a Brevo API key and not the Brevo web login password.

### Rate Limiting and CORS

| Variable | Purpose |
| --- | --- |
| `RATE_LIMIT_WINDOW_MS` | Login rate-limit window in milliseconds; defaults to `900000` (15 minutes) |
| `RATE_LIMIT_MAX_REQUESTS` | Maximum login attempts per IP per window; defaults to `5` |
| `CORS_ORIGIN` | Frontend URL allowed to call backend |

The rate limiter applies to `POST /api/auth/login` and `POST /api/auth/google`; it does not currently apply to every API route.

Production example:

```env
CORS_ORIGIN=https://orthoflow-frontend.onrender.com
```

## Frontend Variables

Frontend folder:

```text
codes/Frontend
```

```env
VITE_API_BASE_URL=https://your-backend-service.onrender.com
VITE_GOOGLE_CLIENT_ID=your_google_client_id.apps.googleusercontent.com
```

Local development:

```env
VITE_API_BASE_URL=http://localhost:3000
VITE_GOOGLE_CLIENT_ID=your_google_client_id.apps.googleusercontent.com
```
