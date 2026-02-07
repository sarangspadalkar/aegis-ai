-- Enable pgvector extension
CREATE EXTENSION IF NOT EXISTS vector;

-- Create embeddings table with vector column for AI embeddings (text-embedding-3-small: 1536 dimensions)
CREATE TABLE IF NOT EXISTS "embeddings" (
    "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    "job_id" TEXT NOT NULL,
    "content_hash" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "embedding" vector(1536),
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS "idx_embeddings_job_id" ON "embeddings"("job_id");
CREATE INDEX IF NOT EXISTS "idx_embeddings_content_hash" ON "embeddings"("content_hash");
