# Aegis-AI — Domain Context

Event-driven media processing pipeline. S3 object upload triggers ingestion; ingestion enqueues a job; the processor dequeues, fetches content, calls OpenAI, and persists an embedding for later retrieval.

## Terms

**Job** (`ProcessingJob`)
A unit of work representing one S3 object to be processed. Has a lifecycle: `PENDING → QUEUED → PROCESSING → COMPLETED | FAILED`. Retried up to 3 times via SQS visibility timeout; after that sent to the DLQ.

**Ingestion**
The Lambda that receives S3 event notifications and enqueues a Job message onto the processing queue. Determines media type from file extension.

**Processor**
The Lambda that dequeues Job messages, fetches the S3 object, calls OpenAI for summarisation and embedding, and persists an Embedding record. Orchestrated by `index.ts`; internal responsibilities split across:

- `config` — env var validation at cold-start
- `openai-client` — OpenAI SDK initialisation from Secrets Manager
- `s3-fetcher` — S3 object retrieval
- `summarizer` — text summarisation via OpenAI chat completion
- `embedder` — vector embedding via OpenAI embeddings API
- `embedding-repo` — raw-SQL persistence of Embedding records into pgvector

**Embedding** (`EmbeddingRecord`)
The persisted output of processing one Job: a summary string, a pgvector float array, a content hash (SHA-256 of the raw object), and metadata (bucket, key, media type). Stored in the `embeddings` table.

**Retry**
OpenAI calls use linear-backoff retry (attempt × base delay). Retry behaviour is provided by `retryAsync<T>` in `@aegis-ai/shared`. Callers supply an `onRetry` hook for logging; the utility itself is context-free.

**Media type**
Either `audio` or `text`. Inferred from S3 object key extension at ingestion time. Stored on the Job message and the Embedding metadata.

**DLQ** (Dead-Letter Queue)
SQS queue that receives Job messages that have failed all retry attempts. Inspected manually; no automated reprocessing.
