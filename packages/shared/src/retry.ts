export interface RetryConfig {
  maxAttempts: number;
  baseDelayMs: number;
  onRetry?: (attempt: number, err: unknown) => void;
}

export async function retryAsync<T>(fn: () => Promise<T>, config: RetryConfig): Promise<T> {
  const { maxAttempts, baseDelayMs, onRetry } = config;
  let lastErr: unknown;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      onRetry?.(attempt, err);
      if (attempt < maxAttempts) {
        await new Promise((r) => setTimeout(r, baseDelayMs * attempt));
      }
    }
  }
  throw lastErr;
}
