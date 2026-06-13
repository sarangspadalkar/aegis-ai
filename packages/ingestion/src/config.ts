import { EnvKeys, requireEnv } from '@aegis-ai/shared';

export function makeConfig(env: NodeJS.ProcessEnv = process.env) {
  return {
    processingQueueUrl: requireEnv(EnvKeys.PROCESSING_QUEUE_URL, env),
    mediaBucketName: requireEnv(EnvKeys.MEDIA_BUCKET_NAME, env),
  };
}

export const config = makeConfig();
