import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { S3Event, S3EventRecord } from 'aws-lambda';

// Hoist the mock so it's available before vi.mock hoisting resolves
const mockSend = vi.hoisted(() => vi.fn().mockResolvedValue({}));

vi.mock('@aws-sdk/client-sqs', () => ({
  // Arrow functions can't be used as constructors (new SQSClient()) — use regular functions
  SQSClient: vi.fn(function (this: Record<string, unknown>) {
    this.send = mockSend;
  }),
  SendMessageCommand: vi.fn(function (this: Record<string, unknown>, params: unknown) {
    Object.assign(this, params);
  }),
}));

vi.mock('../config', () => ({
  config: {
    processingQueueUrl: 'https://sqs.us-east-1.amazonaws.com/123/queue',
    mediaBucketName: 'test-bucket',
  },
}));

function makeRecord(bucket: string, key: string): S3EventRecord {
  return {
    s3: {
      bucket: { name: bucket },
      object: { key: encodeURIComponent(key) },
    },
  } as unknown as S3EventRecord;
}

function makeEvent(records: S3EventRecord[]): S3Event {
  return { Records: records } as S3Event;
}

describe('ingestion handler', () => {
  beforeEach(() => {
    mockSend.mockClear();
  });

  it('enqueues a message to SQS for a matching bucket', async () => {
    const { handler } = await import('../index');

    await handler(makeEvent([makeRecord('test-bucket', 'file.txt')]), {} as any, () => {});

    expect(mockSend).toHaveBeenCalledOnce();
  });

  it('skips records from a non-configured bucket', async () => {
    const { handler } = await import('../index');

    await handler(makeEvent([makeRecord('other-bucket', 'file.txt')]), {} as any, () => {});

    expect(mockSend).not.toHaveBeenCalled();
  });

  it('infers text mediaType for .txt files', async () => {
    const { handler } = await import('../index');

    await handler(makeEvent([makeRecord('test-bucket', 'doc.txt')]), {} as any, () => {});

    const command = mockSend.mock.calls[0][0];
    const body = JSON.parse(command.MessageBody);
    expect(body.mediaType).toBe('text');
  });

  it('infers audio mediaType for .mp3 files', async () => {
    const { handler } = await import('../index');

    await handler(makeEvent([makeRecord('test-bucket', 'audio.mp3')]), {} as any, () => {});

    const command = mockSend.mock.calls[0][0];
    const body = JSON.parse(command.MessageBody);
    expect(body.mediaType).toBe('audio');
  });

  it('includes bucket, key, jobId, and createdAt in the SQS message', async () => {
    const { handler } = await import('../index');

    await handler(makeEvent([makeRecord('test-bucket', 'report.txt')]), {} as any, () => {});

    const command = mockSend.mock.calls[0][0];
    const body = JSON.parse(command.MessageBody);
    expect(body.bucket).toBe('test-bucket');
    expect(body.key).toBe('report.txt');
    expect(body.jobId).toBeDefined();
    expect(body.createdAt).toBeDefined();
  });

  it('throws when SQS send fails', async () => {
    const { handler } = await import('../index');
    mockSend.mockRejectedValueOnce(new Error('SQS down'));

    await expect(
      handler(makeEvent([makeRecord('test-bucket', 'file.txt')]), {} as any, () => {})
    ).rejects.toThrow('SQS down');
  });

  it('processes multiple records in one event', async () => {
    const { handler } = await import('../index');

    await handler(
      makeEvent([
        makeRecord('test-bucket', 'a.txt'),
        makeRecord('test-bucket', 'b.txt'),
      ]),
      {} as any,
      () => {}
    );

    expect(mockSend).toHaveBeenCalledTimes(2);
  });
});
