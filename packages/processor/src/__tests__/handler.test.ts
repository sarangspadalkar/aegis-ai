import { describe, it, expect, vi } from 'vitest';
import type { SQSEvent, SQSRecord } from 'aws-lambda';
import type { S3Client } from '@aws-sdk/client-s3';
import type OpenAI from 'openai';
import type { PrismaClient } from '@aegis-ai/database';
import { createHandler } from '../handler';

function makeRecord(body: object): SQSRecord {
  return { messageId: 'msg-1', body: JSON.stringify(body) } as unknown as SQSRecord;
}

function makeEvent(records: SQSRecord[]): SQSEvent {
  return { Records: records } as SQSEvent;
}

const validMessage = {
  jobId: 'job-1',
  bucket: 'b',
  key: 'k',
  mediaType: 'text' as const,
  createdAt: new Date().toISOString(),
};

function makeDeps(overrides?: Partial<{
  s3Content: string;
  summary: string;
  embedding: number[];
}>) {
  const { s3Content = 'file text', summary = 'a summary', embedding = [0.1, 0.2] } = overrides ?? {};

  const s3 = {
    send: vi.fn().mockResolvedValue({
      Body: { transformToString: vi.fn().mockResolvedValue(s3Content) },
    }),
  } as unknown as S3Client;

  const openai = {
    chat: {
      completions: {
        create: vi.fn().mockResolvedValue({ choices: [{ message: { content: summary } }] }),
      },
    },
    embeddings: {
      create: vi.fn().mockResolvedValue({ data: [{ embedding }] }),
    },
  } as unknown as OpenAI;

  const prisma = { $executeRaw: vi.fn().mockResolvedValue(1) } as unknown as PrismaClient;

  return { s3, openai, prisma };
}

describe('createHandler', () => {
  const retryConfig = { maxAttempts: 1, baseDelayMs: 0 };

  it('processes a valid SQS record end-to-end', async () => {
    const deps = makeDeps();
    const handler = createHandler({ ...deps, retryConfig });

    await handler(makeEvent([makeRecord(validMessage)]), {} as any, () => {});

    expect(deps.s3.send).toHaveBeenCalledOnce();
    expect(deps.openai.chat.completions.create).toHaveBeenCalledOnce();
    expect(deps.openai.embeddings.create).toHaveBeenCalledOnce();
    expect(deps.prisma.$executeRaw).toHaveBeenCalledOnce();
  });

  it('skips a record with an invalid JSON body without throwing', async () => {
    const deps = makeDeps();
    const handler = createHandler({ ...deps, retryConfig });
    const badRecord = { messageId: 'bad', body: 'not-json' } as unknown as SQSRecord;

    await handler(makeEvent([badRecord]), {} as any, () => {});

    expect(deps.s3.send).not.toHaveBeenCalled();
  });

  it('throws when S3 fetch fails', async () => {
    const deps = makeDeps();
    (deps.s3.send as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error('S3 error'));
    const handler = createHandler({ ...deps, retryConfig });

    await expect(
      handler(makeEvent([makeRecord(validMessage)]), {} as any, () => {})
    ).rejects.toThrow('S3 error');
  });

  it('throws when OpenAI summarization fails', async () => {
    const deps = makeDeps();
    (deps.openai.chat.completions.create as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
      new Error('OpenAI down')
    );
    const handler = createHandler({ ...deps, retryConfig });

    await expect(
      handler(makeEvent([makeRecord(validMessage)]), {} as any, () => {})
    ).rejects.toThrow('OpenAI down');
  });

  it('processes multiple records in sequence', async () => {
    const deps = makeDeps();
    const handler = createHandler({ ...deps, retryConfig });

    await handler(
      makeEvent([makeRecord(validMessage), makeRecord({ ...validMessage, jobId: 'job-2' })]),
      {} as any,
      () => {}
    );

    expect(deps.prisma.$executeRaw).toHaveBeenCalledTimes(2);
  });

  it('uses the default retry config when none is provided', async () => {
    const deps = makeDeps();
    // No retryConfig — should still work with the default
    const handler = createHandler(deps);
    await handler(makeEvent([makeRecord(validMessage)]), {} as any, () => {});
    expect(deps.prisma.$executeRaw).toHaveBeenCalledOnce();
  });
});
