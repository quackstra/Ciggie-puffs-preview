// S3-compatible object storage — DigitalOcean Spaces by default (also works for R2/MinIO). Creds via ENV ONLY
// (inject through the run wrapper; never hardcode). Scoped Spaces key (this Space only) is all that's needed.
//   S3_ENDPOINT   e.g. https://nyc3.digitaloceanspaces.com
//   S3_REGION     e.g. nyc3
//   S3_KEY, S3_SECRET, S3_BUCKET (the Space name)
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';

const { S3_ENDPOINT, S3_REGION = 'us-east-1', S3_KEY, S3_SECRET, S3_BUCKET } = process.env;
export const storageReady = () => !!(S3_ENDPOINT && S3_KEY && S3_SECRET && S3_BUCKET);

const client = storageReady()
  ? new S3Client({ region: S3_REGION, endpoint: S3_ENDPOINT, credentials: { accessKeyId: S3_KEY, secretAccessKey: S3_SECRET } })
  : null;

export async function putObject(key, body, contentType, cacheControl) {
  if (!client) throw new Error('storage creds not set (S3_ENDPOINT/S3_KEY/S3_SECRET/S3_BUCKET)');
  await client.send(new PutObjectCommand({ Bucket: S3_BUCKET, Key: key, Body: body, ContentType: contentType, CacheControl: cacheControl, ACL: 'public-read' }));
}
export const putGif = (id, hash, bytes) => putObject(`cdn/${id}/${hash}.gif`, bytes, 'image/gif', 'public, max-age=31536000, immutable');
export const putPointer = (bucketKey) => putObject('ready_bucket', bucketKey, 'text/plain', 'public, max-age=30');
