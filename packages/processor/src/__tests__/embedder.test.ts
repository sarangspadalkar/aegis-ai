import { describe, it, expect, vi } from 'vitest';
import type OpenAI from 'openai';
import { getEmbedding } from '../embedder';

const noRetry = { maxAttempts: 1, baseDelayMs: 0 };

function makeOpenAI(embedding: number[] | undefined): OpenAI {
  return {
    embeddings: {
      create: vi.fn().mockResolvedValue({
        data: [{ embedding }],
      }),
    },
  } as unknown as OpenAI;
}

describe('getEmbedding', () => {
  it('returns the embedding vector from OpenAI', async () => {
    const vec = [0.1, 0.2, 0.3];
    const openai = makeOpenAI(vec);
    const result = await getEmbedding(openai, 'some text', noRetry);
    expect(result).toEqual(vec);
  });

  it('throws when the embedding is missing', async () => {
    const openai = makeOpenAI(undefined);
    await expect(getEmbedding(openai, 'text', noRetry)).rejects.toThrow(
      'Empty embedding response from OpenAI'
    );
  });

  it('truncates input to 8000 characters before sending', async () => {
    const mockCreate = vi.fn().mockResolvedValue({ data: [{ embedding: [0] }] });
    const openai = { embeddings: { create: mockCreate } } as unknown as OpenAI;

    await getEmbedding(openai, 'b'.repeat(12000), noRetry);

    const input = mockCreate.mock.calls[0][0].input as string;
    expect(input.length).toBe(8000);
  });

  it('retries on failure and succeeds on the next attempt', async () => {
    const mockCreate = vi
      .fn()
      .mockRejectedValueOnce(new Error('rate limit'))
      .mockResolvedValue({ data: [{ embedding: [1, 2] }] });
    const openai = { embeddings: { create: mockCreate } } as unknown as OpenAI;

    const result = await getEmbedding(openai, 'text', { maxAttempts: 2, baseDelayMs: 0 });
    expect(result).toEqual([1, 2]);
    expect(mockCreate).toHaveBeenCalledTimes(2);
  });
});
