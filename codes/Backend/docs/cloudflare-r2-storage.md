# Cloudflare R2 Document Storage

The backend can store patient documents and other uploaded files in Cloudflare R2 using its S3-compatible API.

For production, R2 is preferred over Render disk storage because files stay outside the web-service container and survive redeploys, restarts, and service replacement.

## Cloudflare Setup

1. In Cloudflare, open **Storage & databases > R2**.
2. Create a bucket, for example `orthoflow-documents`.
3. Open **R2 > Overview > Manage API Tokens**.
4. Create an API token with **Object Read & Write** permission scoped only to this bucket.
5. Copy the **Access Key ID**, **Secret Access Key**, and S3 endpoint.

The S3 endpoint format is:

```text
https://<ACCOUNT_ID>.r2.cloudflarestorage.com
```

## Render Backend Environment Variables

Add these to the backend service:

```env
FILE_STORAGE_PROVIDER=r2
R2_BUCKET=orthoflow-documents
R2_ENDPOINT=https://<ACCOUNT_ID>.r2.cloudflarestorage.com
R2_ACCESS_KEY_ID=your_r2_access_key_id
R2_SECRET_ACCESS_KEY=your_r2_secret_access_key
R2_REGION=auto
R2_FORCE_PATH_STYLE=true
UPLOAD_DIR=/tmp/uploads
```

`UPLOAD_DIR=/tmp/uploads` is still useful for temporary processing, but production document storage should go to R2.

You can use these generic S3 names instead if you later move to another provider:

```env
FILE_STORAGE_PROVIDER=s3
S3_ENDPOINT=https://<ACCOUNT_ID>.r2.cloudflarestorage.com
S3_BUCKET=orthoflow-documents
S3_ACCESS_KEY_ID=your_access_key_id
S3_SECRET_ACCESS_KEY=your_secret_access_key
S3_REGION=auto
S3_FORCE_PATH_STYLE=true
UPLOAD_DIR=/tmp/uploads
```

## Deployment Notes

- Existing local filesystem documents remain local and will still be downloaded from their saved file path if the file exists.
- New uploads go to R2 only after `FILE_STORAGE_PROVIDER=r2` is set.
- The database stores R2 object metadata in `medical_documents.storage_provider`, `storage_bucket`, and `storage_key`.
- The app serves downloads through the backend, so the R2 bucket can stay private.
- No browser CORS setup is required because the frontend does not upload directly to R2.
- If upload returns `AccessDenied`, check the bucket name, token scope, access key, secret key, and endpoint.
- If old files do not download after a redeploy, they were probably stored only on local Render disk before R2 was enabled.
