import type { S3Handler, S3Event } from 'aws-lambda';
import { SQSClient, SendMessageCommand } from '@aws-sdk/client-sqs';
import { logger } from '@aegis-ai/shared';
import type { SQSProcessingMessage } from '@aegis-ai/shared';
import { randomUUID } from 'crypto';

const sqs = new SQSClient({});
const PROCESSING_QUEUE_URL = process.env.PROCESSING_QUEUE_URL!;
const MEDIA_BUCKET_NAME = process.env.MEDIA_BUCKET_NAME!;

function inferMediaType(key: string): 'audio' | 'text' {
  const ext = key.split('.').pop()?.toLowerCase();
  const textExtensions = ['txt', 'md', 'json'];
  const audioExtensions = ['mp3', 'wav', 'm4a', 'ogg', 'flac'];
  if (textExtensions.includes(ext || '')) return 'text';
  if (audioExtensions.includes(ext || '')) return 'audio';
  return 'text'; // default for .txt trigger
}

export const handler: S3Handler = async (event: S3Event) => {
  const now = new Date().toISOString();

  for (const record of event.Records) {
    const bucket = record.s3.bucket.name;
    const key = decodeURIComponent(record.s3.object.key.replace(/\+/g, ' '));

    if (bucket !== MEDIA_BUCKET_NAME) {
      logger.warn('Ignoring event from non-configured bucket', { bucket, key });
      continue;
    }

    const jobId = randomUUID();
    const mediaType = inferMediaType(key);

    const message: SQSProcessingMessage = {
      jobId,
      bucket,
      key,
      mediaType,
      createdAt: now,
      retryCount: 0,
    };

    logger.jobLifecycle(jobId, 'INGESTION', 'Enqueueing processing job', {
      bucket,
      key,
      mediaType,
    });

    try {
      await sqs.send(
        new SendMessageCommand({
          QueueUrl: PROCESSING_QUEUE_URL,
          MessageBody: JSON.stringify(message),
        })
      );
      logger.jobLifecycle(jobId, 'INGESTION', 'Job enqueued successfully');
    } catch (err) {
      logger.error('Failed to enqueue job', {
        jobId,
        bucket,
        key,
        error: err instanceof Error ? err.message : String(err),
      });
      throw err;
    }
  }
};
