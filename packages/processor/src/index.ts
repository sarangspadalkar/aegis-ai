import type { SQSHandler } from 'aws-lambda';
import { SecretsManagerClient, GetSecretValueCommand } from '@aws-sdk/client-secrets-manager';
import { S3Client, GetObjectCommand } from '@aws-sdk/client-s3';
import OpenAI from 'openai';
import { getPrismaFromSecret, Prisma } from '@aegis-ai/database';
import type { PrismaClient } from '@aegis-ai/database';
import { logger } from '@aegis-ai/shared';
import type { SQSProcessingMessage } from '@aegis-ai/shared';
import { createHash } from 'crypto';

const secrets = new SecretsManagerClient({});
const s3 = new S3Client({});

const PROCESSING_QUEUE_URL = process.env.PROCESSING_QUEUE_URL!;
const MEDIA_BUCKET_NAME = process.env.MEDIA_BUCKET_NAME!;
const OPENAI_SECRET_ARN = process.env.OPENAI_SECRET_ARN!;
const DB_SECRET_ARN = process.env.DB_SECRET_ARN!;
const DB_HOST = process.env.DB_HOST!;
const DB_NAME = process.env.DB_NAME || 'aegisai';

const MAX_OPENAI_RETRIES = 3;
const OPENAI_RETRY_DELAY_MS = 1000;

async function getOpenAIClient(): Promise<OpenAI> {
  const res = await secrets.send(
    new GetSecretValueCommand({ SecretId: OPENAI_SECRET_ARN })
  );
  const secret = JSON.parse(res.SecretString ?? '{}') as { OPENAI_API_KEY?: string };
  const apiKey = secret.OPENAI_API_KEY ?? process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error('OpenAI API key not found in secret or env');
  return new OpenAI({ apiKey });
}

async function getObjectContent(bucket: string, key: string): Promise<string> {
  const out = await s3.send(
    new GetObjectCommand({ Bucket: bucket, Key: key })
  );
  const body = out.Body;
  if (!body) throw new Error(`Empty object: ${bucket}/${key}`);
  return await body.transformToString('utf-8');
}

async function summarizeWithRetry(
  openai: OpenAI,
  text: string,
  jobId: string
): Promise<string> {
  let lastErr: Error | null = null;
  for (let attempt = 1; attempt <= MAX_OPENAI_RETRIES; attempt++) {
    try {
      const completion = await openai.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [
          {
            role: 'system',
            content:
              'Summarize the following text concisely in 2-4 sentences. Output only the summary, no preamble.',
          },
          { role: 'user', content: text.slice(0, 12000) },
        ],
        max_tokens: 256,
      });
      const summary = completion.choices[0]?.message?.content?.trim() ?? '';
      if (summary) return summary;
    } catch (e) {
      lastErr = e instanceof Error ? e : new Error(String(e));
      logger.warn('OpenAI summarization attempt failed', {
        jobId,
        attempt,
        error: lastErr.message,
      });
      if (attempt < MAX_OPENAI_RETRIES) {
        await new Promise((r) => setTimeout(r, OPENAI_RETRY_DELAY_MS * attempt));
      }
    }
  }
  throw lastErr ?? new Error('Summarization failed after retries');
}

async function getEmbeddingWithRetry(
  openai: OpenAI,
  text: string,
  jobId: string
): Promise<number[]> {
  let lastErr: Error | null = null;
  for (let attempt = 1; attempt <= MAX_OPENAI_RETRIES; attempt++) {
    try {
      const res = await openai.embeddings.create({
        model: 'text-embedding-3-small',
        input: text.slice(0, 8000),
      });
      const embedding = res.data[0]?.embedding;
      if (embedding && Array.isArray(embedding)) return embedding;
    } catch (e) {
      lastErr = e instanceof Error ? e : new Error(String(e));
      logger.warn('OpenAI embedding attempt failed', {
        jobId,
        attempt,
        error: lastErr.message,
      });
      if (attempt < MAX_OPENAI_RETRIES) {
        await new Promise((r) => setTimeout(r, OPENAI_RETRY_DELAY_MS * attempt));
      }
    }
  }
  throw lastErr ?? new Error('Embedding failed after retries');
}

function contentHash(text: string): string {
  return createHash('sha256').update(text).digest('hex');
}

/** Insert embedding using raw SQL so we can set the pgvector column. */
async function insertEmbedding(
  prisma: PrismaClient,
  jobId: string,
  contentHash: string,
  summary: string,
  embedding: number[],
  metadata: Record<string, unknown>
): Promise<void> {
  const embeddingStr = `[${embedding.join(',')}]`;
  const metaJson = JSON.stringify(metadata);
  await prisma.$executeRaw(
    Prisma.sql`
      INSERT INTO "embeddings" ("job_id", "content_hash", "summary", "embedding", "metadata")
      VALUES (${jobId}, ${contentHash}, ${summary}, (${embeddingStr})::vector, ${metaJson}::jsonb)
    `
  );
}

export const handler: SQSHandler = async (event) => {
  const start = Date.now();
  const prisma = await getPrismaFromSecret(secrets, DB_SECRET_ARN, {
    host: DB_HOST,
    database: DB_NAME,
  });

  for (const record of event.Records) {
    let body: SQSProcessingMessage;
    try {
      body = JSON.parse(record.body) as SQSProcessingMessage;
    } catch {
      logger.error('Invalid SQS message body', { messageId: record.messageId });
      continue;
    }

    const { jobId: effectiveJobId, bucket, key, mediaType, retryCount = 0 } = body;

    logger.jobLifecycle(effectiveJobId, 'PROCESSING', 'Starting processing', {
      bucket,
      key,
      mediaType,
      retryCount,
    });

    try {
      const content = await getObjectContent(bucket, key);
      const openai = await getOpenAIClient();

      const summary = await summarizeWithRetry(openai, content, effectiveJobId);
      const embedding = await getEmbeddingWithRetry(openai, summary, effectiveJobId);

      const hash = contentHash(content);
      const metadata = { bucket, key, mediaType };

      await insertEmbedding(prisma, effectiveJobId, hash, summary, embedding, metadata);

      const durationMs = Date.now() - start;
      logger.jobLifecycle(effectiveJobId, 'COMPLETED', 'Processing completed', {
        bucket,
        key,
        durationMs,
      });
    } catch (err) {
      const durationMs = Date.now() - start;
      logger.error('Processing failed', {
        jobId: effectiveJobId,
        bucket,
        key,
        retryCount,
        durationMs,
        error: err instanceof Error ? err.message : String(err),
      });
      throw err; // let SQS retry and eventually DLQ
    }
  }
};
