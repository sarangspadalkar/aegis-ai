# Aegis-AI | Scalable Event-Driven Media Processing Pipeline

A production-ready backend system that ingests, processes, and analyzes large-scale media (audio or text) asynchronously using a decoupled microservices architecture.

## Architecture

- **Ingestion**: Media files (audio/text) uploaded to S3 trigger event-driven processing.
- **Queue**: SQS buffers work; failed messages go to a Dead Letter Queue (DLQ) with retry logic.
- **Processing**: Lambda functions call OpenAI for summarization and vector embeddings.
- **Storage**: pgvector (PostgreSQL) stores and queries AI embeddings. Schema and access are defined in the **database** package using Prisma ORM.

## Tech Stack

| Layer           | Technology                    |
|-----------------|-------------------------------|
| Language        | TypeScript / Node.js          |
| Infrastructure  | AWS CDK (IaC)                 |
| Storage         | S3 (media), RDS + pgvector    |
| Database        | Prisma ORM, PostgreSQL + pgvector |
| Queue           | SQS + DLQ                     |
| Compute         | Lambda                        |
| AI/ML           | OpenAI (summarization, embeddings) |
| Secrets         | AWS Secrets Manager           |
| CI/CD           | GitHub Actions                |

## Mono-Repo Structure

```
aegis-ai/
├── packages/
│   ├── shared/          # Types, logger, shared utilities
│   ├── database/        # Prisma schema, migrations, client + types (pgvector)
│   ├── infrastructure/  # AWS CDK stacks (S3, SQS, Lambda, RDS)
│   ├── ingestion/       # S3-triggered Lambda (enqueue jobs)
│   └── processor/       # SQS-triggered Lambda (OpenAI + Prisma/pgvector)
├── .github/workflows/   # CI/CD
└── README.md
```

## Prerequisites

- Node.js 18+
- AWS CLI configured
- AWS CDK CLI: `npm install -g aws-cdk`
- PostgreSQL (for local dev) or use RDS from CDK

## Setup

1. **Install dependencies**
   ```bash
   npm install
   ```

2. **Configure secrets (OpenAI API key)**
   - Store in AWS Secrets Manager as `aegis-ai/openai-api-key` (or set via CDK context).
   - For local runs, use env var `OPENAI_API_KEY`.

3. **Database (Prisma)**
   - Set `DATABASE_URL` for local dev (e.g. `postgresql://user:pass@localhost:5432/aegisai`).
   - Generate the Prisma client and run migrations:
     ```bash
     cd packages/database && npm run db:generate && npm run db:migrate
     ```
   - After deploying the stack, run migrations against RDS (using the URL from AWS Secrets Manager / CDK outputs) or run them from CI/CD.

4. **Bootstrap CDK (first time only)**
   ```bash
   cd packages/infrastructure && npx cdk bootstrap
   ```

5. **Deploy**
   ```bash
   npm run deploy
   ```

## Development

- Build all packages: `npm run build`
- Run tests: `npm run test`
- Format code: `npm run format` / `npm run format:check`
- CDK commands: `npm run cdk -- --help`
- Database: from `packages/database`, `npm run db:studio` (Prisma Studio), `npm run db:migrate:dev` (create migrations)

## Key Features

- **Reliability**: DLQ and configurable retry logic for failed OpenAI calls.
- **Scalability**: SQS buffers traffic; Lambdas scale horizontally.
- **Security**: IAM least privilege; secrets in AWS Secrets Manager.
- **Observability**: Structured logging for job lifecycle (ingestion → completion).

## CI/CD (GitHub Actions)

- **Build and test**: On every push/PR to `main` or `develop`; runs `npm ci`, `npm run build`, and TypeScript check.
- **Deploy**: On push to `main` only; runs CDK deploy. Configure these repository secrets for deploy:
  - `AWS_ROLE_ARN` – IAM role for OIDC (recommended) or use `AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY`
  - `AWS_ACCOUNT_ID` – AWS account ID
  - `AWS_REGION` – (optional) e.g. `us-east-1`

## License

MIT
