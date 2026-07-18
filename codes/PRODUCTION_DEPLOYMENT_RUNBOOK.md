# OrthoFlow Production Deployment Runbook

This document explains the full sequence for deploying OrthoFlow for a real client or stakeholder organization using stakeholder-owned accounts.

The current production stack is:

- GitHub for source code
- Render for backend and frontend hosting
- Aiven for MySQL
- SMTP2GO or Brevo for email sending
- Cloudflare R2 for patient document storage
- Google Cloud OAuth for Google Sign-In

## 1. Ownership Rule

Create every production account using the stakeholder's official email address, not the developer's personal email address.

Recommended account owner:

```text
Official hospital / department / project email
```

Examples:

```text
orthoflow@hospital-domain.lk
it@hospital-domain.lk
orthodontics.admin@hospital-domain.lk
```

The developer may be invited as an admin/member temporarily, but the stakeholder should remain the account owner.

Enable two-factor authentication wherever possible.

## 2. Prepare Before Creating Cloud Services

Collect these details first:

```text
Stakeholder owner email:
Stakeholder billing contact:
Project name:
Frontend public URL:
Backend public URL:
Google sign-in domain:
SMTP sender email:
Initial admin email:
```

For the Dental Faculty production deployment, the preferred sender should be an official Dental Faculty address such as:

```text
no-reply@dental.pdn.ac.lk
```

Decide the production names:

```text
Render project name: orthoflow-production
Backend service name: orthoflow-backend
Frontend service name: orthoflow-frontend
Aiven service name: orthoflow-mysql
Cloudflare R2 bucket name: orthoflow-documents
Email sender/domain: dental.pdn.ac.lk or another stakeholder-approved sender domain
Email provider: SMTP2GO or Brevo
```

## 3. GitHub Repository

1. Log in to GitHub using the stakeholder-owned GitHub account or organization.
2. Create or transfer the production repository.
3. Confirm Render can access this repository.
4. Keep `.env` files out of GitHub.
5. Push the latest working code to the production branch, usually:

```text
main
```

Before deployment, confirm these files are committed:

```text
codes/Backend/Dockerfile
codes/Backend/.dockerignore
codes/Backend/package.json
codes/Backend/package-lock.json
codes/Backend/src/config/database.js
codes/Backend/src/config/mysqlSsl.js
codes/Backend/src/services/fileStorageService.js
codes/Backend/src/controllers/documentController.js
codes/Frontend/src/app/config/api.ts
```

Do not commit:

```text
codes/Backend/.env
codes/Frontend/.env
```

## 4. Create Aiven MySQL

1. Go to Aiven.
2. Create an account using the stakeholder email.
3. Add billing details if using a paid tier.
4. Create a MySQL service.
5. Recommended starting service:

```text
Service: MySQL
Version: MySQL 8.x
Cloud region: same or closest region as Render backend
Service name: orthoflow-mysql
```

6. Wait until the database status is `Running`.
7. Open the MySQL service's connection information.
8. Copy:

```text
Host
Port
User
Password
Database name
CA certificate
```

Use the default database if appropriate:

```text
defaultdb
```

Backend startup guards update selected parts of an existing OrthoFlow schema, but they do not create the core schema in a fresh database.

Before the first backend deployment, initialize the new/empty Aiven database and create the first admin from a trusted administrative machine. Run these commands from the repository root:

```bash
cd codes/Backend
npm ci
npm run bootstrap-db
npm run ensure-admin
```

Use the production Aiven values for `DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASSWORD`, `DB_NAME`, `DB_SSL`, `DB_SSL_REJECT_UNAUTHORIZED`, and `DB_SSL_CA`, together with the `SEED_ADMIN_*` values. Confirm that `DB_NAME` identifies the intended new/empty OrthoFlow database before running `bootstrap-db`. Never run the reset-oriented `migrate` command against production, and take a backup before schema work on an existing database.

## 5. Create Email Sending

OrthoFlow uses standard SMTP settings through Nodemailer. This means the backend can use either SMTP2GO or Brevo without changing application code. Choose one provider for the production deployment, then enter that provider's SMTP values in the Render backend environment variables.

Recommended production sender for the Dental Faculty deployment:

```text
no-reply@dental.pdn.ac.lk
```

This sender must be approved by the Dental Faculty / University IT team. For the most professional and reliable production setup, verify the sender domain:

```text
dental.pdn.ac.lk
```

If the chosen email provider gives DNS records for SPF, DKIM, DMARC, or tracking, ask the University IT/DNS administrator to add those records for `dental.pdn.ac.lk` or the relevant subdomain.

### Option A: SMTP2GO

1. Go to SMTP2GO.
2. Create an account using the stakeholder email.
3. Verify the sending email or domain.
4. Go to **Sending > SMTP Users**.
5. Create or open an SMTP user.
6. Copy:

```text
SMTP username
SMTP password
SMTP server
SMTP port
```

Recommended Render backend values:

```env
EMAIL_SIMULATION=false
SMTP_HOST=mail.smtp2go.com
SMTP_PORT=2525
SMTP_SECURE=false
SMTP_USER=your_smtp2go_smtp_username
SMTP_PASS=your_smtp2go_smtp_password
SMTP_FROM=no-reply@dental.pdn.ac.lk
```

Important: `SMTP_USER` and `SMTP_PASS` must be SMTP2GO SMTP credentials, not the SMTP2GO login password and not a Gmail password.

### Option B: Brevo

1. Go to Brevo.
2. Create an account using the stakeholder email.
3. Open **Settings > Senders, domains, IPs**.
4. Verify either the production sender domain or a temporary testing sender.
5. Open **Settings > SMTP & API > SMTP**.
6. Generate a Standard SMTP key.
7. Copy:

```text
SMTP server
SMTP login
SMTP key/password
```

Recommended Render backend values:

```env
EMAIL_SIMULATION=false
SMTP_HOST=smtp-relay.brevo.com
SMTP_PORT=2525
SMTP_SECURE=false
SMTP_USER=your_brevo_smtp_login
SMTP_PASS=your_brevo_smtp_key
SMTP_FROM=no-reply@dental.pdn.ac.lk
```

Brevo may show port `587` in its dashboard. If Render times out on `587`, use port `2525` with `SMTP_SECURE=false`. If `2525` does not work, try:

```env
SMTP_PORT=465
SMTP_SECURE=true
```

Important: `SMTP_USER` must be the Brevo SMTP login, usually something like `xxxx@smtp-brevo.com`. `SMTP_PASS` must be the Brevo SMTP key, not the Brevo web login password, not a Gmail password, and not a Brevo API key.

Do not enable Brevo SMTP key IP restrictions unless the deployment uses Render's dedicated outbound IP feature or the allowed list includes the applicable shared regional outbound ranges. Render services without dedicated outbound IPs use shared ranges that can change.

SMTP2GO temporary testing note: while demonstrating or piloting before the Dental Faculty sender is ready, use an SMTP2GO-authenticated account and a sender that is verified in the stakeholder's SMTP2GO account:

```env
SMTP_FROM=<verified-testing-sender>
SMTP_USER=<smtp2go-smtp-user>
```

For Brevo testing with a verified Gmail sender, use:

```env
SMTP_FROM=orthoflow97@gmail.com
```

For Brevo, keep `SMTP_USER` as the Brevo SMTP login even when `SMTP_FROM` is a Gmail address. Gmail and other public mailbox domains may appear to recipients through the provider's authenticated sending domain, with the Gmail address as the reply-to address. That is acceptable for testing, but not ideal for production.

Do not keep a temporary student/faculty/personal sender as the final production sender. Move to `no-reply@dental.pdn.ac.lk` or another stakeholder-owned address before real production use.

## 6. Create Cloudflare R2 Storage

Cloudflare R2 stores uploaded patient files. This avoids losing files when Render redeploys or restarts.

1. Create a Cloudflare account using the stakeholder email.
2. Open **R2 Object Storage**.
3. Create a bucket:

```text
orthoflow-documents
```

4. Use Standard storage.
5. Open **Manage R2 API Tokens**.
6. Click **Create Account API token**.
7. Choose:

```text
Permission: Object Read & Write
Bucket scope: Specific bucket only
Bucket: orthoflow-documents
TTL: no expiry / forever
Client IP filtering: leave Include and Exclude empty
```

8. Copy these values:

```text
Access Key ID
Secret Access Key
S3 endpoint
```

The endpoint looks like:

```text
https://ACCOUNT_ID.r2.cloudflarestorage.com
```

Render backend environment variables:

```env
FILE_STORAGE_PROVIDER=r2
UPLOAD_DIR=/tmp/uploads
R2_ENDPOINT=https://ACCOUNT_ID.r2.cloudflarestorage.com
R2_BUCKET=orthoflow-documents
R2_ACCESS_KEY_ID=your_r2_access_key_id
R2_SECRET_ACCESS_KEY=your_r2_secret_access_key
R2_REGION=auto
R2_FORCE_PATH_STYLE=true
```

Keep the bucket private. The frontend does not need direct access to R2.

## 7. Create Google OAuth Client

This is needed for Google Sign-In.

1. Go to Google Cloud Console.
2. Use the stakeholder Google account.
3. Create a project:

```text
OrthoFlow Production
```

4. Configure the OAuth consent screen.
5. Create OAuth credentials:

```text
Application type: Web application
```

6. Add authorized JavaScript origins:

```text
https://orthoflow-frontend.onrender.com
https://your-custom-domain.example
```

Do not add `/login` at the end. Use only the origin.

7. Copy the Client ID:

```text
GOOGLE_CLIENT_ID=xxxxxxxx.apps.googleusercontent.com
```

Use the same client ID in backend and frontend env vars.

## 8. Create Render Project

1. Go to Render.
2. Create a Render account using the stakeholder email.
3. Connect the stakeholder GitHub repository.
4. Create a Render project:

```text
orthoflow-production
```

Render Static Sites are delivered through a global CDN and do not have a selectable deployment region. Choose a backend Web Service region close to the Aiven MySQL region to reduce database latency. A suitable backend region when the database is nearby is:

```text
Singapore
```

## 9. Deploy Backend on Render

Create a new Render Web Service.

Use:

```text
Name: orthoflow-backend
Language: Docker
Branch: main
Root Directory: codes/Backend
Dockerfile Path: ./Dockerfile
```

Recommended first paid tier:

```text
Starter or higher
```

Free tier can be used for testing, but production should use a paid instance to avoid spin-down delays.

Add backend environment variables:

```env
NODE_ENV=production
PORT=10000

DB_HOST=your_aiven_mysql_host
DB_PORT=your_aiven_mysql_port
DB_USER=avnadmin
DB_PASSWORD=your_aiven_mysql_password
DB_NAME=defaultdb
DB_SSL=true
DB_SSL_REJECT_UNAUTHORIZED=true
DB_SSL_CA=your_aiven_ca_certificate

JWT_SECRET=generate_a_long_random_secret
JWT_REFRESH_SECRET=generate_another_long_random_secret
JWT_EXPIRE=24h
JWT_REFRESH_EXPIRE=7d
SESSION_TIMEOUT_SECONDS=3600

GOOGLE_CLIENT_ID=your_google_client_id.apps.googleusercontent.com

AUDIT_LOG_RETENTION_ENABLED=true
AUDIT_LOG_RETENTION_DAYS=180
AUDIT_LOG_CLEANUP_INTERVAL_HOURS=24
AUDIT_LOG_CLEANUP_BATCH_SIZE=5000
AUDIT_LOG_ARCHIVE_BEFORE_DELETE=false

REMINDER_AUTO_SCAN_MS=10000
REMINDER_AUTO_WINDOW_HOURS=48
REMINDER_MAX_CONCURRENT=3

UPLOAD_DIR=/tmp/uploads
MAX_FILE_SIZE=104857600
ALLOWED_FILE_TYPES=jpg,jpeg,png,pdf,doc,docx

FILE_STORAGE_PROVIDER=r2
R2_ENDPOINT=https://ACCOUNT_ID.r2.cloudflarestorage.com
R2_BUCKET=orthoflow-documents
R2_ACCESS_KEY_ID=your_r2_access_key_id
R2_SECRET_ACCESS_KEY=your_r2_secret_access_key
R2_REGION=auto
R2_FORCE_PATH_STYLE=true

RATE_LIMIT_WINDOW_MS=900000
RATE_LIMIT_MAX_REQUESTS=100

CORS_ORIGIN=https://orthoflow-frontend.onrender.com

EMAIL_SIMULATION=false
SMTP_HOST=chosen_email_provider_smtp_host
SMTP_PORT=chosen_email_provider_smtp_port
SMTP_SECURE=false
SMTP_USER=chosen_email_provider_smtp_username
SMTP_PASS=chosen_email_provider_smtp_password_or_key
SMTP_FROM=approved_sender_email
```

Use the SMTP2GO values from **Option A** or the Brevo values from **Option B**. Do not mix credentials between providers.

Do not keep `SEED_ADMIN_PASSWORD` in the Render runtime environment after the one-time `ensure-admin` operation. The running server does not use the `SEED_ADMIN_*` values.

Deploy the backend.

After deployment, open:

```text
https://orthoflow-backend.onrender.com/health
```

Expected result:

```json
{
  "success": true,
  "message": "OrthoFlow API is running",
  "timestamp": "<ISO-8601 timestamp>",
  "version": "1.0.0"
}
```

This endpoint confirms that the backend process is responding. It does not perform a fresh database or object-storage readiness check on each request.

## 10. Deploy Frontend on Render

Create a new Render Static Site.

Use:

```text
Name: orthoflow-frontend
Branch: main
Root Directory: codes/Frontend
Build Command: npm install && npm run build
Publish Directory: dist
```

Add frontend environment variables:

```env
VITE_API_BASE_URL=https://orthoflow-backend.onrender.com
VITE_GOOGLE_CLIENT_ID=your_google_client_id.apps.googleusercontent.com
```

Add a rewrite rule for React Router:

```text
Source: /*
Destination: /index.html
Action: Rewrite
```

Deploy the frontend.

Open:

```text
https://orthoflow-frontend.onrender.com
```

## 11. Update Backend CORS After Frontend URL Exists

After the frontend URL is known, go back to the Render backend environment variables and set:

```env
CORS_ORIGIN=https://orthoflow-frontend.onrender.com
```

Then redeploy the backend.

If using a custom domain later, update CORS again:

```env
CORS_ORIGIN=https://your-custom-domain.example
```

## 12. Update Google OAuth After Frontend URL Exists

Go to Google Cloud Console and add the final frontend origin:

```text
https://orthoflow-frontend.onrender.com
```

If using a custom domain:

```text
https://your-custom-domain.example
```

Do not add backend URLs as JavaScript origins unless the Google button is served from the backend, which this app does not do.

## 13. First Production Login

1. Open the frontend URL.
2. Sign in with the admin account created by the earlier `npm run ensure-admin` step:

```text
SEED_ADMIN_EMAIL
SEED_ADMIN_PASSWORD
```

3. Immediately change the admin password.
4. Create real user accounts.
5. Assign correct roles:

```text
ADMIN
RECEPTION
ORTHODONTIST
DENTAL_SURGEON
STUDENT
NURSE
```

## 14. Functional Verification Checklist

Run through these checks after deployment:

```text
[ ] Backend /health endpoint loads
[ ] Frontend loads
[ ] Email/password login works
[ ] Google Sign-In works
[ ] Admin can create users
[ ] Reception can create patients
[ ] Patient directory loads
[ ] Care team assignment works
[ ] Dental surgeon can assign an assigned patient to a student
[ ] Clinic queue works
[ ] Queue wait time shows Sri Lanka time correctly
[ ] Password reset email sends through the chosen email provider
[ ] Patient document upload works
[ ] Uploaded document appears in Cloudflare R2 bucket
[ ] Uploaded document downloads after backend redeploy
[ ] Dental chart can be edited
[ ] Dental chart annotation popup stays open when Pathology/Treatment fields are focused on a phone-sized viewport
[ ] Dental chart PDF downloads with graphics/colors
[ ] Student case supervision works for orthodontists and dental surgeons
[ ] Admin can delete a removed student case
[ ] Reports page loads
[ ] Audit log loads
```

## 15. R2 Document Storage Verification

1. Upload a new patient document.
2. Open Cloudflare R2 bucket.
3. Confirm a new object exists under:

```text
patients/<patient-id>/documents/
```

4. Download the file from the app.
5. Redeploy the backend.
6. Download the same file again.

If the file still downloads after redeploy, R2 is working.

Old documents uploaded before R2 was enabled may not download if their local Render files were already lost. Those files must be reuploaded.

## 16. Dental Chart PDF Verification

The backend Docker deployment uses the Playwright Chromium image so dental chart PDFs render with graphics/colors.

Check:

```text
[ ] Save dental chart version
[ ] Download dental chart PDF
[ ] PDF contains chart graphics/colors
```

If it falls back to text-only PDFs, confirm backend is deployed as Docker and using:

```text
Root Directory: codes/Backend
Dockerfile Path: ./Dockerfile
```

## 17. Backup and Recovery

Minimum production backup expectations:

```text
Aiven MySQL backups: enabled by Aiven plan
Cloudflare R2 files: persistent object storage plus a separately defined recovery/export strategy
GitHub repository: latest source code
Render env vars: securely documented by stakeholder
```

Recommended stakeholder-controlled secure records:

```text
Render account owner
Aiven account owner
Cloudflare account owner
Email provider account owner
Google Cloud project owner
GitHub repository owner
Admin recovery email
Billing contact
```

Do not store live secrets in GitHub.

## 18. Secret Rotation Before Final Handover

Before final production handover, rotate secrets that were shared during development:

```text
Aiven MySQL password
JWT_SECRET
JWT_REFRESH_SECRET
Email provider SMTP password/key
Cloudflare R2 Access Key ID and Secret Access Key
Google OAuth credentials if exposed
Initial admin password
```

After rotating secrets, update Render environment variables and redeploy.

## 19. Monthly Maintenance

Recommended monthly checks:

```text
[ ] Render backend service healthy
[ ] Render frontend service healthy
[ ] Aiven MySQL storage usage
[ ] Cloudflare R2 storage usage
[ ] Email provider usage
[ ] Password reset email still works
[ ] Patient document upload/download still works
[ ] Review audit logs
[ ] Check user accounts and remove inactive users
```

## 20. Common Problems

### Google Sign-In origin_mismatch

Fix:

```text
Google Cloud Console > OAuth Client > Authorized JavaScript origins
```

Add:

```text
https://orthoflow-frontend.onrender.com
```

Do not add `/login`.

### SMTP2GO Invalid Login

Fix:

```text
Use SMTP2GO SMTP username and SMTP password.
Do not use the SMTP2GO web login password.
```

### Brevo Connection Timeout

Fix:

```text
Use SMTP_HOST=smtp-relay.brevo.com.
Try SMTP_PORT=2525 and SMTP_SECURE=false first.
If 2525 fails, try SMTP_PORT=465 and SMTP_SECURE=true.
Restart the Render backend after changing env vars.
```

### Brevo Authentication or Sender Problems

Fix:

```text
Use the Brevo SMTP login as SMTP_USER.
Use a Brevo SMTP key as SMTP_PASS.
Do not use the Brevo web login password.
Do not use a Brevo API key as SMTP_PASS.
Confirm SMTP_FROM is a verified sender in Brevo.
Do not enable SMTP key IP restrictions unless the deployment uses Render's dedicated outbound IP feature or the allowed list includes the applicable shared regional outbound ranges.
```

If using a Gmail sender for testing, recipients may see a Brevo sending domain with the Gmail address as reply-to. For production, use a stakeholder-owned verified domain such as dental.pdn.ac.lk.

### R2 AccessDenied

Check:

```text
R2_BUCKET exactly matches bucket name
Token has Object Read & Write
Token is scoped to the same bucket
R2_ACCESS_KEY_ID and R2_SECRET_ACCESS_KEY are correct
R2_ENDPOINT uses the correct account ID
```

### Old Documents Do Not Download

Old files uploaded before R2 may have been saved only on Render's temporary filesystem.

Fix:

```text
Reupload missing documents after R2 is enabled.
```

### Backend Slow After Inactivity

Free Render services spin down after inactivity.

Fix:

```text
Upgrade backend to a paid Render instance.
```

### Dental Chart PDF Is Text-Only

Fix:

```text
Deploy backend using Docker with codes/Backend/Dockerfile.
```

## 21. Final Handover Checklist

Before handing over:

```text
[ ] Stakeholder owns all service accounts
[ ] Developer has only temporary invited access
[ ] Billing is configured by stakeholder
[ ] All exposed development secrets are rotated
[ ] Admin account password changed
[ ] R2 upload/download verified
[ ] Email sending verified
[ ] Google Sign-In verified
[ ] Aiven database verified
[ ] Render backend and frontend verified
[ ] Backup/recovery responsibilities explained
[ ] Monthly maintenance schedule agreed
```
