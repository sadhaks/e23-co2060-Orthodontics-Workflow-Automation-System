# Operations and Maintenance

This guide is for the technical officer or IT staff member maintaining the deployed system.

## Routine Deployment Workflow

1. Pull or sync the latest repository changes.
2. Make changes in the maintainer fork.
3. Test locally where possible.
4. Push the commit to GitHub.
5. Deploy the latest commit in Render.
6. Check the frontend and backend health.

Recommended command flow:

```bash
git status
git pull --rebase origin main
git add .
git commit -m "Describe the change"
git push
```

If the remote has newer commits, pull/rebase before pushing.

## Render Deployment

There are usually two Render services:

- frontend static site
- backend Docker web service

When a normal code/documentation change is pushed:

- use normal deploy from the latest commit

When dependencies, Docker image, or build cache behavior changed:

- use Clear Build Cache and Deploy

For simple environment variable changes:

- save the environment variable
- redeploy or restart the service if Render does not restart automatically

## Health Checks

Backend:

```text
https://your-backend.onrender.com/health
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

This is a process-liveness response. The endpoint does not perform a fresh database or object-storage readiness check on each request.

Frontend:

Open the frontend URL and confirm the login page loads.

## Logs to Check

Render backend logs are the first place to check for:

- database connection errors
- SMTP errors
- R2 upload/download errors
- Google auth errors
- API 500 errors
- Playwright/PDF rendering errors

Aiven logs/metrics help with:

- database availability
- CPU/memory/storage usage
- query issues

Cloudflare R2 helps with:

- uploaded object presence
- bucket access
- storage usage

## Backups

Maintain backups for:

- Aiven MySQL database
- Cloudflare R2 bucket
- GitHub repository
- Render environment variables and service configuration

The uploaded files are not stored only in Render when R2 is enabled. They are stored in Cloudflare R2.

R2 persistence is not an independent backup. Define and test a separate recovery strategy, such as scheduled exports or replication to a separately controlled destination. Record the recovery owner, frequency, retention period, and restoration test procedure. Confirm the exact Aiven backup retention and restore options provided by the selected service plan.

## Secrets and Passwords

Rotate secrets if:

- a key is exposed
- a developer leaves the project
- a deployment account changes owner
- a provider recommends rotation

Important secrets:

- `JWT_SECRET`
- `JWT_REFRESH_SECRET`
- database password
- R2 access keys
- SMTP password/key
- Google OAuth credentials

## Email Maintenance

If email stops working:

1. Check whether the sender email is still verified.
2. Check SMTP username/password/key.
3. Check SMTP port.
4. Check provider quota.
5. Check Render backend logs.

For production, prefer an institutional sender such as:

```text
no-reply@dental.pdn.ac.lk
```

## File Upload Maintenance

If old files do not download:

- check whether they were uploaded before R2 was enabled
- check whether they exist in local Render storage or R2
- check `medical_documents.storage_provider`, `storage_bucket`, and `storage_key`

If new uploads fail:

- verify R2 bucket name
- verify R2 token permissions
- verify R2 endpoint/account ID
- verify Render environment variables

## Database Maintenance

The backend includes startup schema checks, but maintainers should still be careful.

Before major schema updates:

1. Take or confirm a database backup.
2. Deploy to a test environment if available.
3. Deploy backend.
4. Watch backend logs during startup.
5. Test affected screens.

## Ownership Handover

Before handing over the system, confirm that the stakeholder owns:

- GitHub repository/fork
- Render account/services
- Aiven project
- Cloudflare R2 account/bucket
- SMTP2GO or Brevo account
- Google Cloud OAuth project
