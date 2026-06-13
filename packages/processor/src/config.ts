function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required env var: ${name}`);
  return value;
}

export const config = {
  processingQueueUrl: requireEnv('PROCESSING_QUEUE_URL'),
  mediaBucketName: requireEnv('MEDIA_BUCKET_NAME'),
  openaiSecretArn: requireEnv('OPENAI_SECRET_ARN'),
  dbSecretArn: requireEnv('DB_SECRET_ARN'),
  dbHost: requireEnv('DB_HOST'),
  dbName: process.env.DB_NAME ?? 'aegisai',
  maxOpenaiRetries: 3,
  openaiRetryDelayMs: 1000,
};
