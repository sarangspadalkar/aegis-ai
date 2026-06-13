import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { PrismaClient } from '@aegis-ai/database';
import { execSync } from 'child_process';
import path from 'path';
import type { S3Client } from '@aws-sdk/client-s3';
import type OpenAI from 'openai';
import type { SQSEvent } from 'aws-lambda';
import { createHandler } from '../handler';

const DB_PACKAGE_PATH = path.resolve(process.cwd(), 'packages/database');

function makeSqsEvent(body: object): SQSEvent {
  return {
    Records: [
      {
        messageId: 'test-message-id',
        receiptHandle: 'test-receipt-handle',
        body: JSON.stringify(body),
        attributes: {
          ApproximateReceiveCount: '1',
          SentTimestamp: '0',
          SenderId: 'test',
          ApproximateFirstReceiveTimestamp: '0',
        },
        messageAttributes: {},
        md5OfBody: '',
        eventSource: 'aws:sqs',
        eventSourceARN: 'arn:aws:sqs:us-east-1:123456789:test-queue',
        awsRegion: 'us-east-1',
      },
    ],
  };
}

function makeFakeS3(content: string): S3Client {
  return {
    send: vi.fn().mockResolvedValue({
      Body: { transformToString: vi.fn().mockResolvedValue(content) },
    }),
  } as unknown as S3Client;
}

function makeFakeOpenAI(summary: string, embedding: number[]): OpenAI {
  return {
    chat: {
      completions: {
        create: vi.fn().mockResolvedValue({
          choices: [{ message: { content: summary } }],
        }),
      },
    },
    embeddings: {
      create: vi.fn().mockResolvedValue({
        data: [{ embedding }],
      }),
    },
  } as unknown as OpenAI;
}

describe('processor handler (integration)', () => {
  let container: StartedPostgreSqlContainer;
  let prisma: PrismaClient;

  beforeAll(async () => {
    container = await new PostgreSqlContainer('pgvector/pgvector:pg16').start();

    execSync('npx prisma migrate deploy', {
      cwd: DB_PACKAGE_PATH,
      env: { ...process.env, DATABASE_URL: container.getConnectionUri() },
      stdio: 'pipe',
    });

    prisma = new PrismaClient({ datasources: { db: { url: container.getConnectionUri() } } });
    await prisma.$connect();
  }, 120_000);

  afterAll(async () => {
    await prisma.$disconnect();
    await container.stop();
  });

  beforeEach(async () => {
    await prisma.$executeRaw`TRUNCATE TABLE embeddings`;
  });

  it('skips a record with a malformed body and resolves without throwing', async () => {
    const handler = createHandler({
      s3: makeFakeS3('irrelevant'),
      openai: makeFakeOpenAI('irrelevant', Array(1536).fill(0)),
      prisma,
      retryConfig: { maxAttempts: 1, baseDelayMs: 0 },
    });

    const event: SQSEvent = {
      Records: [{ ...makeSqsEvent({}).Records[0], body: 'not-valid-json{{' }],
    };

    await expect(handler(event, {} as never, () => {})).resolves.toBeUndefined();

    const rows = await prisma.$queryRaw<unknown[]>`SELECT * FROM embeddings`;
    expect(rows).toHaveLength(0);
  }, 30_000);

  it('throws when S3 fetch fails so SQS can retry the message', async () => {
    const brokenS3 = {
      send: vi.fn().mockRejectedValue(new Error('S3 NoSuchKey')),
    } as unknown as S3Client;

    const handler = createHandler({
      s3: brokenS3,
      openai: makeFakeOpenAI('irrelevant', Array(1536).fill(0)),
      prisma,
      retryConfig: { maxAttempts: 1, baseDelayMs: 0 },
    });

    await expect(
      handler(
        makeSqsEvent({ jobId: 'job-s3-fail', bucket: 'test-bucket', key: 'missing.txt', mediaType: 'text', createdAt: new Date().toISOString() }),
        {} as never,
        () => {}
      )
    ).rejects.toThrow('S3 NoSuchKey');

    const rows = await prisma.$queryRaw<unknown[]>`SELECT * FROM embeddings`;
    expect(rows).toHaveLength(0);
  }, 30_000);

  it('throws when OpenAI fails after all retries so SQS can retry the message', async () => {
    const brokenOpenAI = {
      chat: {
        completions: {
          create: vi.fn().mockRejectedValue(new Error('OpenAI rate limit')),
        },
      },
      embeddings: { create: vi.fn() },
    } as unknown as OpenAI;

    const handler = createHandler({
      s3: makeFakeS3('some content'),
      openai: brokenOpenAI,
      prisma,
      retryConfig: { maxAttempts: 2, baseDelayMs: 0 },
    });

    await expect(
      handler(
        makeSqsEvent({ jobId: 'job-openai-fail', bucket: 'test-bucket', key: 'doc.txt', mediaType: 'text', createdAt: new Date().toISOString() }),
        {} as never,
        () => {}
      )
    ).rejects.toThrow('OpenAI rate limit');

    expect(brokenOpenAI.chat.completions.create).toHaveBeenCalledTimes(2);

    const rows = await prisma.$queryRaw<unknown[]>`SELECT * FROM embeddings`;
    expect(rows).toHaveLength(0);
  }, 30_000);

  it('stores an embedding record when processing a valid SQS message', async () => {
    const jobId = 'job-golden-path-001';
    const content = 'The quick brown fox jumps over the lazy dog.';
    const summary = 'A fox jumps over a dog.';
    const embedding = Array(1536).fill(0.01);

    const handler = createHandler({
      s3: makeFakeS3(content),
      openai: makeFakeOpenAI(summary, embedding),
      prisma,
      retryConfig: { maxAttempts: 1, baseDelayMs: 0 },
    });

    await handler(
      makeSqsEvent({ jobId, bucket: 'test-bucket', key: 'docs/fox.txt', mediaType: 'text', createdAt: new Date().toISOString() }),
      {} as never,
      () => {}
    );

    const rows = await prisma.$queryRaw<Array<{ job_id: string; summary: string; content_hash: string }>>`
      SELECT job_id, summary, content_hash FROM embeddings WHERE job_id = ${jobId}
    `;

    expect(rows).toHaveLength(1);
    expect(rows[0].job_id).toBe(jobId);
    expect(rows[0].summary).toBe(summary);
  }, 30_000);
});
