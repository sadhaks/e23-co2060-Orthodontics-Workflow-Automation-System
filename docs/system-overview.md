# System Overview

OrthoFlow is a web application for managing orthodontic clinic workflows. It is designed for use by administrators, orthodontists, dental surgeons, nurses, reception staff, and students.

## What the System Does

The system helps the clinic manage:

- user accounts and roles
- patient registration and patient profiles
- patient assignment to orthodontists, dental surgeons, and students
- visits and appointments
- live clinic queue status
- dental chart entries and dental chart PDF versions
- uploaded patient documents and images
- diagnosis notes and treatment plans
- payment records
- materials used per patient
- materials and inventory stock
- student case management for students, orthodontist supervisors, dental surgeon supervisors, and admin cleanup
- reports and analytics
- audit logs for system activity

For a screen-by-screen explanation, see the [Complete Feature Guide](feature-guide.md). For account creation and login behavior, see [Accounts, Sign-In, and Access](accounts-and-access.md).

## Main Parts

### Frontend

The frontend is the web interface used in the browser. It is built with React and Vite and lives in:

```text
codes/Frontend
```

Users interact with patients, visits, documents, charts, reports, and settings through this frontend.

The frontend includes responsive layout and touch-friendly controls for common phone and tablet workflows, including dental chart annotation popups and student case management.

### Backend

The backend is the API server. It handles login, permissions, database access, file uploads, email sending, audit logs, and PDF generation. It is built with Node.js and Express and lives in:

```text
codes/Backend
```

### MySQL Database

The database stores structured system data such as users, patients, visits, dental chart records, payment records, inventory records, student cases, and audit logs.

### File Storage

Uploaded documents and images are stored in Cloudflare R2 or another S3-compatible object storage service. The database stores metadata about each file, but the actual file content is stored in object storage.

### Email Provider

The backend sends system emails using SMTP. SMTP2GO and Brevo are both supported through environment variables.

## Important Production Note

The backend should be deployed with Docker in production. Dental chart PDF generation depends on Playwright/Chromium, and the Docker image includes the needed browser dependencies.
