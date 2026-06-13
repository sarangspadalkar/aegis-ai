import { describe, it, expect, vi } from 'vitest';
import { retryAsync } from '../retry';

describe('retryAsync', () => {
  it('returns the result immediately on first success', async () => {
    const fn = vi.fn().mockResolvedValue('ok');

    const result = await retryAsync(fn, { maxAttempts: 3, baseDelayMs: 0 });

    expect(result).toBe('ok');
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('retries on failure and returns the first success', async () => {
    const fn = vi.fn()
      .mockRejectedValueOnce(new Error('first fail'))
      .mockRejectedValueOnce(new Error('second fail'))
      .mockResolvedValue('ok');

    const result = await retryAsync(fn, { maxAttempts: 3, baseDelayMs: 0 });

    expect(result).toBe('ok');
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it('throws the last error after exhausting all attempts', async () => {
    const fn = vi.fn().mockRejectedValue(new Error('always fails'));

    await expect(retryAsync(fn, { maxAttempts: 3, baseDelayMs: 0 }))
      .rejects.toThrow('always fails');

    expect(fn).toHaveBeenCalledTimes(3);
  });

  it('calls onRetry with the attempt number and error on each failure', async () => {
    const onRetry = vi.fn();
    const firstErr = new Error('first');
    const secondErr = new Error('second');

    const fn = vi.fn()
      .mockRejectedValueOnce(firstErr)
      .mockRejectedValueOnce(secondErr)
      .mockResolvedValue('ok');

    await retryAsync(fn, { maxAttempts: 3, baseDelayMs: 0, onRetry });

    expect(onRetry).toHaveBeenCalledTimes(2);
    expect(onRetry).toHaveBeenNthCalledWith(1, 1, firstErr);
    expect(onRetry).toHaveBeenNthCalledWith(2, 2, secondErr);
  });

  it('does not call onRetry when the first attempt succeeds', async () => {
    const onRetry = vi.fn();
    const fn = vi.fn().mockResolvedValue('ok');

    await retryAsync(fn, { maxAttempts: 3, baseDelayMs: 0, onRetry });

    expect(onRetry).not.toHaveBeenCalled();
  });
});
