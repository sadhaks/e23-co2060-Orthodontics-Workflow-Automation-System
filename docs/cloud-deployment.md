# Cloud Deployment

This guide explains the production deployment process for a future maintainer.

For a very detailed step-by-step guide, also see:

```text
codes/PRODUCTION_DEPLOYMENT_RUNBOOK.md
```

## Accounts Needed

Use the stakeholder or institution email address to create/own these accounts:

- GitHub account or organization access
- Render account
- Aiven account
- Cloudflare account
- SMTP2GO or Brevo account
- Google Cloud project for OAuth

For institutional production, use institution-owned accounts rather than a student or developer personal account.

## Recommended Production Services

| Purpose | Service |
| --- | --- |
| Frontend hosting | Render Static Site |
| Backend hosting | Render Web Service using Docker |
| MySQL database | Aiven MySQL |
| Uploaded files | Cloudflare R2 |
| Email sending | SMTP2GO or Brevo |
| Google login | Google OAuth Client ID |

## Repository Workflow

1. Fork the parent repository, usually from the `cepdnaclk` organization repository.
2. Connect Render to the stakeholder fork.
3. Deploy from the chosen production branch, normally `main`.
4. For future updates, push commits to the fork and redeploy from Render.

## Backend Deployment on Render

Create a new Render Web Service.

Recommended settings:

| Setting | Value |
| --- | --- |
| Runtime | Docker |
| Root Directory | `codes/Backend` |
| Dockerfile Path | `./Dockerfile` |
| Branch | production branch, usually `main` |
| Instance Type | Starter or higher for production |

The Docker deployment is important for dental chart PDF rendering because the backend uses Playwright/Chromium.

Add backend environment variables from [Environment Variables](environment-variables.md).

## Frontend Deployment on Render

Create a new Render Static Site.

Recommended settings:

| Setting | Value |
| --- | --- |
| Root Directory | `codes/Frontend` |
| Build Command | `npm install && npm run build` |
| Publish Directory | `dist` |
| Rewrite Rule | `/*` to `/index.html` |

Add frontend environment variables:

```env
VITE_API_BASE_URL=https://your-backend-service.onrender.com
VITE_GOOGLE_CLIENT_ID=your_google_client_id.apps.googleusercontent.com
```

After frontend deployment, update backend `CORS_ORIGIN` to the frontend Render URL.

## Aiven MySQL

Create an Aiven MySQL service.

Record:

- host
- port
- database name
- user
- password
- CA certificate

Backend production should use:

```env
DB_SSL=true
DB_SSL_REJECT_UNAUTHORIZED=true
DB_SSL_CA=-----BEGIN CERTIFICATE-----
...
-----END CERTIFICATE-----
```

Before the first backend deployment, initialize the new/empty Aiven database and create the first admin from a trusted administrative machine. Run these commands from the repository root:

```bash
cd codes/Backend
npm ci
npm run bootstrap-db
npm run ensure-admin
```

Use the production database and `SEED_ADMIN_*` environment variables for this one-time operation. Confirm that `DB_NAME` points to the intended new/empty OrthoFlow database before running `bootstrap-db`. Back up an existing database before any schema operation.

## Cloudflare R2

Create an R2 bucket for uploaded patient files.

Create an R2 API token with object read/write access to that bucket.

Backend production should use:

```env
FILE_STORAGE_PROVIDER=r2
UPLOAD_DIR=/tmp/uploads
R2_ENDPOINT=https://ACCOUNT_ID.r2.cloudflarestorage.com
R2_BUCKET=orthoflow-documents
R2_ACCESS_KEY_ID=your_access_key_id
R2_SECRET_ACCESS_KEY=your_secret_access_key
R2_REGION=auto
R2_FORCE_PATH_STYLE=true
```

## Email Provider

Choose either SMTP2GO or Brevo.

The app does not need code changes to switch providers. Only environment variables change.

For production, prefer an institutional sender such as:

```text
no-reply@dental.pdn.ac.lk
```

The sender must be verified in the email provider account.

## Google Sign-In

In Google Cloud Console:

1. Create or use an OAuth Client ID for a web application.
2. Add the frontend production URL as an authorized JavaScript origin.
3. Add local development origins if needed.
4. Put the same client ID in:
   - backend `GOOGLE_CLIENT_ID`
   - frontend `VITE_GOOGLE_CLIENT_ID`

## Deployment Order

Recommended order:

1. Create Aiven MySQL.
2. Initialize the new MySQL schema and first admin once.
3. Create Cloudflare R2 bucket and token.
4. Create SMTP provider credentials.
5. Create Google OAuth client.
6. Deploy backend on Render.
7. Check backend `/health`.
8. Deploy frontend on Render.
9. Update backend `CORS_ORIGIN`.
10. Test login, file upload/download, email sending, dental chart PDF download, and reports.
