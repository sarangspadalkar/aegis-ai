import { describe, it, expect, vi } from 'vitest';

// Must run before the module is imported so the module-level `config = makeConfig()` doesn't throw
vi.hoisted(() => {
  process.env.PROCESSING_QUEUE_URL = 'https://sqs.us-east-1.amazonaws.com/dummy/queue';
  process.env.MEDIA_BUCKET_NAME = 'dummy-bucket';
});

import { makeConfig } from '../config';

describe('makeConfig', () => {
  const validEnv = {
    PROCESSING_QUEUE_URL: 'https://sqs.us-east-1.amazonaws.com/123/queue',
    MEDIA_BUCKET_NAME: 'my-bucket',
  };

  it('returns processingQueueUrl and mediaBucketName from env', () => {
    const config = makeConfig(validEnv);
    expect(config.processingQueueUrl).toBe(validEnv.PROCESSING_QUEUE_URL);
    expect(config.mediaBucketName).toBe(validEnv.MEDIA_BUCKET_NAME);
  });

  it('throws when PROCESSING_QUEUE_URL is missing', () => {
    expect(() => makeConfig({ MEDIA_BUCKET_NAME: 'bucket' })).toThrow('PROCESSING_QUEUE_URL');
  });

  it('throws when MEDIA_BUCKET_NAME is missing', () => {
    expect(() => makeConfig({ PROCESSING_QUEUE_URL: 'url' })).toThrow('MEDIA_BUCKET_NAME');
  });

  it('throws when env is empty', () => {
    expect(() => makeConfig({})).toThrow();
  });
});
