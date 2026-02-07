/**
 * Shared types for Aegis-AI pipeline.
 */

export type MediaType = 'audio' | 'text';

export type JobStatus =
  | 'PENDING'
  | 'QUEUED'
  | 'PROCESSING'
  | 'COMPLETED'
  | 'FAILED';

export interface ProcessingJob {
  jobId: string;
  bucket: string;
  key: string;
  mediaType: MediaType;
  status: JobStatus;
  createdAt: string; // ISO
  updatedAt?: string;
  summary?: string;
  embeddingId?: string;
  error?: string;
  retryCount?: number;
}

export interface SQSProcessingMessage {
  jobId: string;
  bucket: string;
  key: string;
  mediaType: MediaType;
  createdAt: string;
  retryCount?: number;
}

export interface EmbeddingRecord {
  id: string;
  jobId: string;
  contentHash: string;
  summary: string;
  embedding: number[];
  metadata: Record<string, unknown>;
  createdAt: string;
}

export const JOB_STATUS = {
  PENDING: 'PENDING' as const,
  QUEUED: 'QUEUED' as const,
  PROCESSING: 'PROCESSING' as const,
  COMPLETED: 'COMPLETED' as const,
  FAILED: 'FAILED' as const,
};
