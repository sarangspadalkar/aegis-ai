import { describe, it, expect, vi } from 'vitest';
import type { PrismaClient } from '@aegis-ai/database';
import { insertEmbedding } from '../embedding-repo';

function makePrisma(): PrismaClient {
  return { $executeRaw: vi.fn().mockResolvedValue(1) } as unknown as PrismaClient;
}

describe('insertEmbedding', () => {
  it('calls $executeRaw once', async () => {
    const prisma = makePrisma();
    await insertEmbedding(prisma, 'job-1', 'hash', 'summary', [0.1, 0.2], { bucket: 'b' });
    expect(prisma.$executeRaw).toHaveBeenCalledOnce();
  });

  it('formats the embedding as a bracketed comma-separated string', async () => {
    const prisma = makePrisma();
    await insertEmbedding(prisma, 'job-1', 'hash', 'summary', [1, 2, 3], {});

    const args = (prisma.$executeRaw as ReturnType<typeof vi.fn>).mock.calls[0];
    // Tagged template: args[0] is TemplateStringsArray, args[1..n] are interpolated values
    // embeddingStr is the 4th interpolated value (after jobId, contentHash, summary)
    expect(args[4]).toBe('[1,2,3]');
  });

  it('serializes metadata as JSON', async () => {
    const prisma = makePrisma();
    const meta = { bucket: 'b', key: 'k', mediaType: 'text' };
    await insertEmbedding(prisma, 'job-1', 'hash', 'summary', [0], meta);

    const args = (prisma.$executeRaw as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(args[5]).toBe(JSON.stringify(meta));
  });

  it('passes jobId, contentHash, and summary as separate interpolations', async () => {
    const prisma = makePrisma();
    await insertEmbedding(prisma, 'my-job', 'my-hash', 'my-summary', [0], {});

    const args = (prisma.$executeRaw as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(args[1]).toBe('my-job');
    expect(args[2]).toBe('my-hash');
    expect(args[3]).toBe('my-summary');
  });
});
