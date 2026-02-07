# @aegis-ai/database

Prisma schema, migrations, and client for Aegis-AI (PostgreSQL + pgvector).

## Schema

- **Embedding** – stores job ID, content hash, summary, vector embedding (1536 dims), and JSON metadata.

The `embedding` column uses PostgreSQL’s pgvector extension. The migration enables the extension and creates the table.

## Setup

1. Set `DATABASE_URL` (e.g. `postgresql://user:pass@host:5432/aegisai`).
2. Generate the client and run migrations:

   ```bash
   npm run db:generate
   npm run db:migrate
   ```

For local development you can use `npm run db:migrate:dev` or `npm run db:push`.

## Exports

```ts
import {
  prisma,
  getPrismaClient,
  createPrismaClient,
  buildDatabaseUrl,
  PrismaClient,
  Prisma,
} from '@aegis-ai/database';

// When DATABASE_URL is in env (e.g. local):
await prisma.embedding.findMany();

// When building URL at runtime (e.g. Lambda with Secrets Manager):
const config = { host, port: 5432, username, password, database: 'aegisai' };
const url = buildDatabaseUrl(config);
const client = createPrismaClient(url);
await client.$executeRaw(Prisma.sql`...`);

// Lambda: get client from Secrets Manager (cached per container):
const prisma = await getPrismaFromSecret(secretsClient, process.env.DB_SECRET_ARN!, {
  host: process.env.DB_HOST,
  database: process.env.DB_NAME,
});
```

- **prisma** – default singleton (uses `process.env.DATABASE_URL`).
- **getPrismaClient()** – returns the default client.
- **createPrismaClient(url)** – returns a new client for the given URL (reuse in Lambda).
- **getPrismaFromSecret(secretsClient, secretArn, overrides?)** – fetches DB credentials from AWS Secrets Manager, builds URL, creates and caches a Prisma client. Use in Lambda; call once per handler and reuse the returned client.
- **buildDatabaseUrl(config)** – builds a `postgresql://` URL from `DatabaseUrlConfig`.
- **PrismaClient** – class type.
- **Prisma** – namespace for `Prisma.sql` and types.

## Vector inserts

The `embedding` column is `vector(1536)`. Use raw SQL for inserts that set it (see processor’s `insertEmbedding`).
