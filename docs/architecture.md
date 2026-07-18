# Architecture

This document explains how the system is connected in production.

## High-Level Flow

```text
Browser
  |
  | HTTPS
  v
Render Static Site
  |
  | API requests
  v
Render Backend Docker Service
  |        |          |
  |        |          +--> SMTP2GO or Brevo for email
  |        |
  |        +--> Cloudflare R2 for uploaded files
  |
  +--> Aiven MySQL for structured data
```

## Frontend

Location:

```text
codes/Frontend
```

Technology:

- React
- TypeScript
- Vite
- Tailwind-style utility classes
- Google Sign-In client integration

Production hosting:

- Render Static Site
- Build command: `npm install && npm run build`
- Publish directory: `dist`
- SPA rewrite: `/*` to `/index.html`

The frontend calls the backend URL from:

```text
VITE_API_BASE_URL
```

## Backend

Location:

```text
codes/Backend
```

Technology:

- Node.js
- Express
- MySQL using `mysql2`
- JWT authentication
- Nodemailer for SMTP
- Multer for upload handling
- AWS SDK S3 client for R2/S3 storage
- Playwright/Chromium for dental chart PDF rendering

Production hosting:

- Render Web Service
- Runtime: Docker
- Root directory: `codes/Backend`
- Dockerfile path: `./Dockerfile`

The backend exposes the following API groups:

- `/api/auth`
- `/api/users`
- `/api/patients`
- `/api/visits`
- `/api/documents`
- `/api/clinical-notes`
- `/api/payment-records`
- `/api/patient-materials`
- `/api/queue`
- `/api/cases`
- `/api/inventory`
- `/api/reports`

Health check:

```text
/health
```

## Database

Production database:

- Aiven MySQL
- SSL required
- The backend reads Aiven host, port, username, password, database name, and CA certificate from environment variables.

The backend includes startup schema guards that add selected newer tables and columns to an already initialized OrthoFlow database. The guards do not create the core schema in a fresh database. A new database must first be initialized with `npm run bootstrap-db`, followed by `npm run ensure-admin` to create the first administrator.

## Object Storage

Uploaded patient documents/images should use Cloudflare R2 in production.

The backend supports:

- local storage for development
- S3-compatible storage
- Cloudflare R2

R2 is configured using:

```text
FILE_STORAGE_PROVIDER=r2
R2_ENDPOINT=...
R2_BUCKET=...
R2_ACCESS_KEY_ID=...
R2_SECRET_ACCESS_KEY=...
```

## Email

Email sending is provider-independent. The backend only needs SMTP settings.

Supported production options:

- SMTP2GO
- Brevo

Email is used for:

- initial-account and administrator-reset temporary-password emails
- appointment reminders

## Authentication

The system supports:

- email/password login
- Google Sign-In
- JWT access tokens
- refresh tokens
- forced password change after admin password reset
- idle session timeout

Google Sign-In requires the same Google OAuth client ID in:

- backend `GOOGLE_CLIENT_ID`
- frontend `VITE_GOOGLE_CLIENT_ID`
