import { EnvKeys, requireEnv } from '@aegis-ai/shared';

export function makeConfig(env: NodeJS.ProcessEnv = process.env) {
  return {
    openaiSecretArn: requireEnv(EnvKeys.OPENAI_SECRET_ARN, env),
    dbSecretArn: requireEnv(EnvKeys.DB_SECRET_ARN, env),
    dbHost: requireEnv(EnvKeys.DB_HOST, env),
    dbName: env[EnvKeys.DB_NAME] ?? 'aegisai',
    maxOpenaiRetries: 3,
    openaiRetryDelayMs: 1000,
  };
}

export const config = makeConfig();
