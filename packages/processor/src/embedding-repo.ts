import type { PrismaClient } from '@aegis-ai/database';

export async function insertEmbedding(
  prisma: PrismaClient,
  jobId: string,
  contentHash: string,
  summary: string,
  embedding: number[],
  metadata: Record<string, unknown>
): Promise<void> {
  const embeddingStr = `[${embedding.join(',')}]`;
  const metaJson = JSON.stringify(metadata);
  await prisma.$executeRaw`
    INSERT INTO "embeddings" ("job_id", "content_hash", "summary", "embedding", "metadata")
    VALUES (${jobId}, ${contentHash}, ${summary}, (${embeddingStr})::vector, ${metaJson}::jsonb)
  `;
}
