import { S3Client, GetObjectCommand } from '@aws-sdk/client-s3';

export async function getObjectContent(s3: S3Client, bucket: string, key: string): Promise<string> {
  const out = await s3.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
  if (!out.Body) throw new Error(`Empty object: ${bucket}/${key}`);
  return out.Body.transformToString('utf-8');
}
