# Troubleshooting

This document lists common production issues and how to investigate them.

## Frontend Is Blank

Possible causes:

- frontend build failed
- browser cache
- wrong frontend environment variables
- API base URL missing or wrong
- temporary internet/loading issue

Check:

- Render frontend deployment logs
- browser console
- `VITE_API_BASE_URL`
- whether backend `/health` works

## Login Works Locally but Not in Cloud

Check:

- backend `CORS_ORIGIN` equals the deployed frontend URL
- frontend `VITE_API_BASE_URL` equals the deployed backend URL
- backend is live and not sleeping
- browser console/network tab

## Google Sign-In Shows `origin_mismatch`

In Google Cloud Console, add the frontend URL to authorized JavaScript origins.

Examples:

```text
https://orthoflow-frontend.onrender.com
http://localhost:5173
```

Then redeploy/restart frontend if `VITE_GOOGLE_CLIENT_ID` changed.

## Email Sending Fails

Common errors:

- invalid SMTP credentials
- wrong SMTP port
- sender email not verified
- provider quota exceeded
- public email domain restrictions

For SMTP2GO:

- use SMTP2GO SMTP username/password
- do not use the web login password

For Brevo:

- use the Brevo SMTP login as `SMTP_USER`
- use a Brevo SMTP key as `SMTP_PASS`
- try port `2525` with `SMTP_SECURE=false` on Render

## R2 Upload Fails with `AccessDenied`

Check:

- bucket name exactly matches `R2_BUCKET`
- token has object read/write access
- endpoint/account ID is correct
- access key and secret key are copied correctly
- token was created for the correct Cloudflare account

## Uploaded File Does Not Download

If the log says the file is missing from `src/uploads`, it may have been uploaded before R2 was enabled or while local storage was still configured.

Check:

- whether the file exists in Cloudflare R2
- `medical_documents.storage_provider`
- `medical_documents.storage_bucket`
- `medical_documents.storage_key`
- `FILE_STORAGE_PROVIDER=r2` is set for new uploads

## Dental Chart PDF Has Only Text or Missing Graphics

Use Docker for the backend deployment. The backend Dockerfile uses a Playwright image with Chromium dependencies.

Check:

- Render backend runtime is Docker
- root directory is `codes/Backend`
- Dockerfile path is `./Dockerfile`
- deployment uses the latest commit

## Aiven MySQL SSL Errors

Check:

```env
DB_SSL=true
DB_SSL_REJECT_UNAUTHORIZED=true
DB_SSL_CA=-----BEGIN CERTIFICATE-----
...
-----END CERTIFICATE-----
```

The CA certificate must be copied fully, including begin/end certificate lines.

## Reports Fail with MySQL Syntax Errors

Check Render logs for the exact SQL error.

If the issue appears after a deployment:

1. Confirm backend deployed from the latest commit.
2. Confirm Aiven schema startup completed successfully.
3. Check whether the failing query is already fixed in the latest branch.

## Render Shows `SIGTERM`

`SIGTERM received. Shutting down gracefully...` is normal during redeploys or restarts. It only indicates Render is stopping the old container.

If the service repeatedly restarts, check logs immediately before the `SIGTERM`.

## Render Free Service Is Slow After Inactivity

Free Render web services can spin down after inactivity. The first request after sleep can take a long time.

For production, use a paid backend instance such as Render Starter or higher.

## Audit Log Timezone Looks Wrong

The frontend displays audit log timestamps in Sri Lanka time. If timestamps look wrong:

- check that the deployed frontend includes the latest timestamp formatting change
- check browser timezone assumptions
- compare the raw backend timestamp with displayed time

## Build Warning: Large Frontend Chunk

Vite may warn that a JavaScript chunk is larger than 500 kB.

This is a performance warning, not a deployment failure. The site can still work. It can be optimized later with route-based code splitting or Rollup manual chunks.

