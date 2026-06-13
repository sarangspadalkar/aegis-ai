export const EnvKeys = {
  PROCESSING_QUEUE_URL: 'PROCESSING_QUEUE_URL',
  MEDIA_BUCKET_NAME: 'MEDIA_BUCKET_NAME',
  OPENAI_SECRET_ARN: 'OPENAI_SECRET_ARN',
  DB_SECRET_ARN: 'DB_SECRET_ARN',
  DB_HOST: 'DB_HOST',
  DB_NAME: 'DB_NAME',
} as const;

export type EnvKey = keyof typeof EnvKeys;

export function requireEnv(name: string, env: NodeJS.ProcessEnv = process.env): string {
  const value = env[name];
  if (!value) throw new Error(`Missing required env var: ${name}`);
  return value;
}
