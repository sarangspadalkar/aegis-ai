/**
 * Build a PostgreSQL connection URL from config.
 * Use this with credentials from env, Secrets Manager, or similar.
 */

export interface DatabaseUrlConfig {
  host: string;
  port?: number;
  username: string;
  password: string;
  database: string;
  schema?: string;
}

/**
 * Build a `postgresql://` URL from config. Password is URI-encoded.
 */
export function buildDatabaseUrl(config: DatabaseUrlConfig): string {
  const port = config.port ?? 5432;
  const password = encodeURIComponent(config.password);
  const schema = config.schema ?? 'public';
  return `postgresql://${config.username}:${password}@${config.host}:${port}/${config.database}?schema=${schema}`;
}
