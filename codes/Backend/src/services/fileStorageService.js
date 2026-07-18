const fs = require('fs');
const fsp = require('fs').promises;
const {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand
} = require('@aws-sdk/client-s3');

const truthy = (value) => ['true', '1', 'yes'].includes(String(value || '').toLowerCase());

const getStorageProvider = () => {
  const provider = String(process.env.FILE_STORAGE_PROVIDER || 'local').toLowerCase();
  return provider === 'r2' ? 's3' : provider;
};

const isObjectStorageEnabled = () => ['s3', 'r2'].includes(String(process.env.FILE_STORAGE_PROVIDER || '').toLowerCase());

const getBucket = () => process.env.S3_BUCKET || process.env.R2_BUCKET;

const getEndpoint = () => {
  if (process.env.S3_ENDPOINT || process.env.R2_ENDPOINT) {
    return process.env.S3_ENDPOINT || process.env.R2_ENDPOINT;
  }

  if (process.env.R2_ACCOUNT_ID) {
    return `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`;
  }

  return undefined;
};

const getRegion = () => process.env.S3_REGION || process.env.R2_REGION || 'auto';

const getAccessKeyId = () => process.env.S3_ACCESS_KEY_ID || process.env.R2_ACCESS_KEY_ID;

const getSecretAccessKey = () => process.env.S3_SECRET_ACCESS_KEY || process.env.R2_SECRET_ACCESS_KEY;

let s3Client;

const getS3Client = () => {
  if (!s3Client) {
    const endpoint = getEndpoint();
    const accessKeyId = getAccessKeyId();
    const secretAccessKey = getSecretAccessKey();

    if (!endpoint || !getBucket() || !accessKeyId || !secretAccessKey) {
      throw new Error('S3/R2 storage is enabled, but endpoint, bucket, access key, or secret key is missing');
    }

    s3Client = new S3Client({
      region: getRegion(),
      endpoint,
      forcePathStyle: truthy(process.env.S3_FORCE_PATH_STYLE || process.env.R2_FORCE_PATH_STYLE || 'true'),
      credentials: {
        accessKeyId,
        secretAccessKey
      }
    });
  }

  return s3Client;
};

const normalizePathPart = (value) => String(value || '')
  .replace(/[^a-zA-Z0-9._-]/g, '-')
  .replace(/-+/g, '-')
  .replace(/^-|-$/g, '');

const buildObjectKey = ({ patientId, filename }) => {
  const safePatientId = normalizePathPart(patientId) || 'unknown-patient';
  const safeFilename = normalizePathPart(filename) || `${Date.now()}`;
  return `patients/${safePatientId}/documents/${safeFilename}`;
};

const uploadLocalFileToObjectStorage = async ({ localPath, key, contentType }) => {
  const bucket = getBucket();
  const body = fs.createReadStream(localPath);

  await getS3Client().send(new PutObjectCommand({
    Bucket: bucket,
    Key: key,
    Body: body,
    ContentType: contentType || 'application/octet-stream'
  }));

  return {
    storage_provider: 's3',
    storage_bucket: bucket,
    storage_key: key
  };
};

const getStoredObjectStream = async (document) => {
  if ((document.storage_provider || 'local') === 's3') {
    const response = await getS3Client().send(new GetObjectCommand({
      Bucket: document.storage_bucket || getBucket(),
      Key: document.storage_key || document.file_path
    }));

    return response.Body;
  }

  await fsp.access(document.file_path);
  return fs.createReadStream(document.file_path);
};

const deleteStoredObject = async (document) => {
  if ((document.storage_provider || 'local') === 's3') {
    await getS3Client().send(new DeleteObjectCommand({
      Bucket: document.storage_bucket || getBucket(),
      Key: document.storage_key || document.file_path
    }));
    return;
  }

  await fsp.unlink(document.file_path);
};

const cleanupLocalFile = async (localPath) => {
  if (!localPath) return;
  await fsp.unlink(localPath).catch(() => {});
};

module.exports = {
  isObjectStorageEnabled,
  getStorageProvider,
  buildObjectKey,
  uploadLocalFileToObjectStorage,
  getStoredObjectStream,
  deleteStoredObject,
  cleanupLocalFile
};
