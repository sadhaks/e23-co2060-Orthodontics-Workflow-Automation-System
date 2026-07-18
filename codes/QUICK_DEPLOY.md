# OrthoFlow Quick Deployment Guide

This is a short operational checklist for deploying the current system. For full handover instructions, use `../docs/cloud-deployment.md`.

## 1. Required Services

Use stakeholder-owned accounts where possible.

- GitHub fork of the parent repository
- Render for frontend and backend hosting
- Aiven MySQL for the production database
- Cloudflare R2 for uploaded patient documents and images
- SMTP2GO or Brevo for email
- Google Cloud OAuth for Google Sign-In

## 2. Backend Service on Render

Create a Render **Web Service**.

Recommended backend settings:

- Runtime: Docker
- Root directory: `codes/Backend`
- Dockerfile path: `./Dockerfile`
- Instance: Starter or higher for production
- Region: preferably close to the Aiven database region

Important backend environment variables:

```env
NODE_ENV=production
PORT=10000
CORS_ORIGIN=https://<frontend-service>.onrender.com

DB_HOST=<aiven-host>
DB_PORT=<aiven-port>
DB_USER=avnadmin
DB_PASSWORD=<aiven-password>
DB_NAME=defaultdb
DB_SSL=true
DB_SSL_REJECT_UNAUTHORIZED=true
DB_SSL_CA=<aiven-ca-certificate>

JWT_SECRET=<long-random-secret>
JWT_REFRESH_SECRET=<different-long-random-secret>

GOOGLE_CLIENT_ID=<google-client-id>

FILE_STORAGE_PROVIDER=r2
R2_BUCKET=<bucket-name>
R2_ENDPOINT=https://<cloudflare-account-id>.r2.cloudflarestorage.com
R2_ACCESS_KEY_ID=<r2-access-key-id>
R2_SECRET_ACCESS_KEY=<r2-secret-access-key>
R2_REGION=auto
R2_FORCE_PATH_STYLE=true
UPLOAD_DIR=/tmp/uploads

EMAIL_SIMULATION=false
SMTP_HOST=<smtp-host>
SMTP_PORT=<smtp-port>
SMTP_SECURE=false
SMTP_USER=<smtp-username>
SMTP_PASS=<smtp-password-or-key>
SMTP_FROM=<verified-sender-address>
```

After deployment, check:

```text
https://<backend-service>.onrender.com/health
```

## 3. Frontend Static Site on Render

Create a Render **Static Site**.

Recommended frontend settings:

- Root directory: `codes/Frontend`
- Build command: `npm install && npm run build`
- Publish directory: `dist`

Frontend environment variables:

```env
VITE_API_BASE_URL=https://<backend-service>.onrender.com
VITE_GOOGLE_CLIENT_ID=<google-client-id>
```

After deployment, open the frontend URL and test login.

## 4. Aiven MySQL

Create an Aiven MySQL service and copy:

- host
- port
- database name
- username
- password
- CA certificate

The backend startup guards update selected parts of an existing OrthoFlow schema, but they do not create the core schema in a fresh database.

Before the first backend deployment, configure the Aiven database variables and intended `SEED_ADMIN_*` values on a trusted administrative machine, then initialize the new/empty database once from the repository root:

```bash
cd codes/Backend
npm ci
npm run bootstrap-db
npm run ensure-admin
```

Confirm that `DB_NAME` identifies the intended new/empty OrthoFlow database before running `bootstrap-db`. Back up an existing database before any schema operation. Normal later deployments use the startup guards for supported incremental changes.

## 5. Cloudflare R2

Create one private bucket for OrthoFlow files.

Recommended bucket contents:

- patient documents
- uploaded images
- uploaded PDFs

The database stores the object key and metadata. R2 stores the actual file bytes.
Dental-chart version PDFs and complete patient-record PDFs are generated on demand and streamed to the requester; the backend does not store those generated PDFs in R2.

## 6. Email Provider

Either SMTP2GO or Brevo can be used.

SMTP2GO:

```env
SMTP_HOST=mail.smtp2go.com
SMTP_PORT=2525
SMTP_SECURE=false
SMTP_USER=<smtp2go-smtp-user>
SMTP_PASS=<smtp2go-smtp-password>
SMTP_FROM=<verified-sender>
```

Brevo:

```env
SMTP_HOST=smtp-relay.brevo.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=<brevo-login>
SMTP_PASS=<brevo-smtp-key>
SMTP_FROM=<verified-sender>
```

For final production, prefer a faculty-owned sender such as:

```text
no-reply@dental.pdn.ac.lk
```

## 7. Google OAuth

In Google Cloud Console, configure the OAuth web client.

Authorized JavaScript origins:

```text
https://<frontend-service>.onrender.com
```

No redirect URI is normally needed for the Google Identity Services button used by the frontend.

## 8. Final Smoke Test

After backend and frontend are deployed:

1. Open backend `/health`.
2. Open frontend.
3. Sign in using email/password.
4. Sign in using Google.
5. Create or open a patient.
6. Upload a document and download it.
7. Save and download a dental chart PDF.
8. On a phone-sized viewport, open the dental chart annotation popup and focus the Pathology/Treatment fields.
9. Confirm student case assignment/supervision works for orthodontists and dental surgeons.
10. Confirm admin can delete a removed student case.
11. As an admin, generate a temporary-password reset email for a test user.
12. Check audit logs as admin.
13. Confirm Render logs show no repeated errors.
