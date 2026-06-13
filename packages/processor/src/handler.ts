import type { SQSHandler } from 'aws-lambda';
import type { S3Client } from '@aws-sdk/client-s3';
import type OpenAI from 'openai';
import type { PrismaClient } from '@aegis-ai/database';
import { createHash } from 'crypto';
import { logger } from '@aegis-ai/shared';
import type { SQSProcessingMessage } from '@aegis-ai/shared';
import { getObjectContent } from './s3-fetcher';
import { summarize } from './summarizer';
import { getEmbedding } from './embedder';
import { insertEmbedding } from './embedding-repo';

export interface HandlerDeps {
  s3: S3Client;
  openai: OpenAI;
  prisma: PrismaClient;
  retryConfig?: { maxAttempts: number; baseDelayMs: number };
}

export function createHandler({ s3, openai, prisma, retryConfig }: HandlerDeps): SQSHandler {
  const retry = retryConfig ?? { maxAttempts: 3, baseDelayMs: 1000 };

  return async (event) => {
    const start = Date.now();

    for (const record of event.Records) {
      let body: SQSProcessingMessage;
      try {
        body = JSON.parse(record.body) as SQSProcessingMessage;
      } catch {
        logger.error('Invalid SQS message body', { messageId: record.messageId });
        continue;
      }

      const { jobId, bucket, key, mediaType, retryCount = 0 } = body;

      logger.jobLifecycle(jobId, 'PROCESSING', 'Starting processing', {
        bucket,
        key,
        mediaType,
        retryCount,
      });

      try {
        const content = await getObjectContent(s3, bucket, key);

        const summary = await summarize(openai, content, {
          ...retry,
          onRetry: (attempt: number, err: unknown) =>
            logger.warn('OpenAI summarization attempt failed', {
              jobId,
              attempt,
              error: err instanceof Error ? err.message : String(err),
            }),
        });

        const embedding = await getEmbedding(openai, summary, {
          ...retry,
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
}
