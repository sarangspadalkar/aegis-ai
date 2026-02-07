# Aegis-AI

**Scalable Event-Driven Media Processing Pipeline**

A production-ready backend that ingests, processes, and analyzes large-scale media (audio or text) asynchronously using a decoupled, event-driven architecture. Built with TypeScript, AWS (CDK, S3, SQS, Lambda, RDS), OpenAI, and PostgreSQL (pgvector).

---

## What It Does

1. **Ingest** – Upload media (e.g. `.txt`) to S3; events trigger a Lambda that enqueues a job.
2. **Queue** – SQS buffers work; failed messages go to a Dead Letter Queue (DLQ) after retries.
3. **Process** – A Lambda reads from SQS, fetches the object from S3, calls OpenAI for summarization and embeddings, then stores the result in PostgreSQL with pgvector.
4. **Store** – Prisma + pgvector persist embeddings for later search or analysis.

---

## Architecture

```mermaid
flowchart LR
  subgraph Ingress
    S3[(S3 Media Bucket)]
  end

  subgraph Compute
    Ingestion[Ingestion Lambda]
    Processor[Processor Lambda]
  end

  subgraph Queue
    SQS[SQS Queue]
    DLQ[Dead Letter Queue]
  end

  subgraph Storage
    RDS[(RDS PostgreSQL + pgvector)]
  end

  Secrets[Secrets Manager]

  S3 -->|Object created| Ingestion
  Ingestion -->|Send message| SQS
  SQS -->|Poll| Processor
  SQS -.->|Failed after retries| DLQ
  Processor -->|Read object| S3
  Processor -->|Summarize + embed| OpenAI[OpenAI API]
  Processor -->|Insert embeddings| RDS
  Secrets -.->|API key, DB creds| Processor
```

- **Reliability** – DLQ and retry logic for failed OpenAI or DB calls.
- **Scalability** – SQS buffers spikes; Lambdas scale out automatically.
- **Security** – IAM least privilege; secrets in AWS Secrets Manager.
- **Observability** – Structured logging for each job (ingestion → completion).

---

## Tech Stack

| Layer        | Technology                         |
|-------------|-------------------------------------|
| Language    | TypeScript / Node.js                |
| Infrastructure | AWS CDK (IaC)                    |
| Storage     | S3 (media), RDS PostgreSQL + pgvector |
| Database    | Prisma ORM, pgvector                |
| Queue       | SQS + DLQ                          |
| Compute     | Lambda                              |
| AI/ML       | OpenAI (summarization, embeddings) |
| Secrets     | AWS Secrets Manager                |
| CI/CD       | GitHub Actions                     |

---

## Mono-Repo Structure

```
aegis-ai/
├── packages/
│   ├── shared/          # Types, logger, shared utilities
│   ├── database/        # Prisma schema, migrations, client (pgvector)
│   ├── infrastructure/  # AWS CDK (S3, SQS, Lambda, RDS)
│   ├── ingestion/       # S3 → Lambda → SQS
│   └── processor/       # SQS → Lambda → OpenAI → Prisma/pgvector
├── .github/workflows/   # CI/CD
├── scripts/             # Helpers (e.g. create-commits.sh)
└── README.md
```

---

## Prerequisites

- **Node.js** 18+ (project uses 22.x)
- **AWS CLI** configured
- **AWS CDK** – `npm install -g aws-cdk`
- **PostgreSQL** for local dev (or use RDS after deploy)

---

## Quick Start

### 1. Install

```bash
npm install
```

### 2. Secrets

- **OpenAI** – In AWS Secrets Manager create/update `aegis-ai/openai-api-key` with your API key. For local runs, `OPENAI_API_KEY` env var is enough.
- **Database** – After deploy, RDS credentials are in Secrets Manager. For local dev, set `DATABASE_URL` (e.g. `postgresql://user:pass@localhost:5432/aegisai`).

### 3. Database (Prisma)

```bash
cd packages/database && npm run db:generate && npm run db:migrate
```

### 4. Bootstrap CDK (once per account/region)

```bash
cd packages/infrastructure && npx cdk bootstrap
```

### 5. Deploy

```bash
npm run deploy
```

After deploy, upload a `.txt` file to the media bucket to trigger the pipeline.

---

## Development

| Command | Description |
|--------|-------------|
| `npm run build` | Build all packages |
| `npm run typecheck` | Type-check all packages (builds shared + database first) |
| `npm run test` | Run tests in all packages |
| `npm run format` | Format with Prettier |
| `npm run format:check` | Check formatting only |
| `npm run cdk -- --help` | CDK commands (synth, diff, deploy, etc.) |
| `npm run deploy` | Deploy CDK stack |

**Database (from `packages/database`):**

- `npm run db:studio` – Prisma Studio
- `npm run db:migrate:dev` – Create and apply migrations in dev
- `npm run db:push` – Push schema without migrations

---

## CI/CD (GitHub Actions)

- **Build / typecheck** – On push and PRs to `main` and `develop`.
- **Deploy** – On push to `main` (optional). Configure repo secrets:
  - `AWS_ROLE_ARN` (OIDC) or `AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY`
  - `AWS_ACCOUNT_ID`
  - `AWS_REGION` (e.g. `us-east-1`)

---

## License

MIT
