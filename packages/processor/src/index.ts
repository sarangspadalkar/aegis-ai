import type { SQSHandler } from 'aws-lambda';
import { SecretsManagerClient } from '@aws-sdk/client-secrets-manager';
import { S3Client } from '@aws-sdk/client-s3';
import { createHash } from 'crypto';
import { getPrismaFromSecret } from '@aegis-ai/database';
import { logger } from '@aegis-ai/shared';
import type { SQSProcessingMessage } from '@aegis-ai/shared';
import { config } from './config';
import { getOpenAIClient } from './openai-client';
import { getObjectContent } from './s3-fetcher';
import { summarize } from './summarizer';
import { getEmbedding } from './embedder';
import { insertEmbedding } from './embedding-repo';

const secrets = new SecretsManagerClient({});
const s3 = new S3Client({});

const retryConfig = {
  maxAttempts: config.maxOpenaiRetries,
  baseDelayMs: config.openaiRetryDelayMs,
};

export const handler: SQSHandler = async (event) => {
  const start = Date.now();
  const prisma = await getPrismaFromSecret(secrets, config.dbSecretArn, {
    host: config.dbHost,
    database: config.dbName,
  });
  const openai = await getOpenAIClient(secrets, config.openaiSecretArn);

  for (const record of event.Records) {
    let body: SQSProcessingMessage;
    try {
      body = JSON.parse(record.body) as SQSProcessingMessage;
    } catch {
      logger.error('Invalid SQS message body', { messageId: record.messageId });
      continue;
    }

    const { jobId, bucket, key, mediaType, retryCount = 0 } = body;

    logger.jobLifecycle(jobId, 'PROCESSING', 'Starting processing', { bucket, key, mediaType, retryCount });

    try {
      const content = await getObjectContent(s3, bucket, key);

      const summary = await summarize(openai, content, {
        ...retryConfig,
        onRetry: (attempt: number, err: unknown) =>
          logger.warn('OpenAI summarization attempt failed', {
            jobId,
            attempt,
            error: err instanceof Error ? err.message : String(err),
          }),
      });

      const embedding = await getEmbedding(openai, summary, {
        ...retryConfig,
        onRetry: (attempt: number, err: unknown) =>
          logger.warn('OpenAI embedding attempt failed', {
            jobId,
            attempt,
            error: err instanceof Error ? err.message : String(err),
          }),
      });

      const hash = createHash('sha256').update(content).digest('hex');
      await insertEmbedding(prisma, jobId, hash, summary, embedding, { bucket, key, mediaType });

      logger.jobLifecycle(jobId, 'COMPLETED', 'Processing completed', {
        bucket,
        key,
        durationMs: Date.now() - start,
      });
    } catch (err) {
      logger.error('Processing failed', {
        jobId,
        bucket,
        key,
        retryCount,
        durationMs: Date.now() - start,
        error: err instanceof Error ? err.message : String(err),
      });
      throw err;
    }
  }
};
