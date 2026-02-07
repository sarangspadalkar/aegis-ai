import type { SecretsManagerClient } from '@aws-sdk/client-secrets-manager';
import { GetSecretValueCommand } from '@aws-sdk/client-secrets-manager';
import { createPrismaClient } from './client';
import { buildDatabaseUrl } from './url';
import type { PrismaClient } from '@prisma/client';

export interface GetPrismaFromSecretOverrides {
  host?: string;
  database?: string;
}

const cache = new Map<string, PrismaClient>();

function cacheKey(secretArn: string, overrides?: GetPrismaFromSecretOverrides): string {
  const host = overrides?.host ?? '';
  const database = overrides?.database ?? '';
  return `${secretArn}:${host}:${database}`;
}

/**
 * Get a Prisma client using credentials from AWS Secrets Manager.
 * Caches the client by (secretArn, host, database) so the same Lambda container reuses one connection.
 * Call once per handler (e.g. at the start of your Lambda) and reuse the returned client.
 */
export async function getPrismaFromSecret(
  secretsClient: SecretsManagerClient,
  secretArn: string,
  overrides?: GetPrismaFromSecretOverrides
): Promise<PrismaClient> {
  const key = cacheKey(secretArn, overrides);
  const cached = cache.get(key);
  if (cached) return cached;

  const res = await secretsClient.send(
    new GetSecretValueCommand({ SecretId: secretArn })
  );
  const secret = JSON.parse(res.SecretString ?? '{}') as {
    username?: string;
    password?: string;
    host?: string;
    port?: number;
  };

  const url = buildDatabaseUrl({
    host: overrides?.host ?? secret.host ?? '',
    port: secret.port ?? 5432,
    username: secret.username ?? '',
    password: secret.password ?? '',
    database: overrides?.database ?? 'aegisai',
  });

  const client = createPrismaClient(url);
  cache.set(key, client);
  return client;
}
