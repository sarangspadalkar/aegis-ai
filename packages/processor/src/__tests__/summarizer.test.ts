import { describe, it, expect, vi } from 'vitest';
import type OpenAI from 'openai';
import { summarize } from '../summarizer';

const noRetry = { maxAttempts: 1, baseDelayMs: 0 };

function makeOpenAI(content: string | null | undefined): OpenAI {
  return {
    chat: {
      completions: {
        create: vi.fn().mockResolvedValue({
          choices: [{ message: { content } }],
        }),
      },
    },
  } as unknown as OpenAI;
}

describe('summarize', () => {
  it('returns the trimmed summary from OpenAI', async () => {
    const openai = makeOpenAI('  This is a summary.  ');
    const result = await summarize(openai, 'some text', noRetry);
    expect(result).toBe('This is a summary.');
  });

  it('throws when OpenAI returns null content', async () => {
    const openai = makeOpenAI(null);
    await expect(summarize(openai, 'text', noRetry)).rejects.toThrow(
      'Empty summary response from OpenAI'
    );
  });

  it('throws when OpenAI returns empty string', async () => {
    const openai = makeOpenAI('');
    await expect(summarize(openai, 'text', noRetry)).rejects.toThrow(
      'Empty summary response from OpenAI'
    );
  });

  it('truncates input to 12000 characters before sending', async () => {
    const mockCreate = vi.fn().mockResolvedValue({
      choices: [{ message: { content: 'summary' } }],
    });
    const openai = { chat: { completions: { create: mockCreate } } } as unknown as OpenAI;

    await summarize(openai, 'a'.repeat(20000), noRetry);

    const messages = mockCreate.mock.calls[0][0].messages as { role: string; content: string }[];
    const userMessage = messages.find((m) => m.role === 'user');
    expect(userMessage?.content.length).toBe(12000);
  });

  it('retries on failure and succeeds on the next attempt', async () => {
    const mockCreate = vi
      .fn()
      .mockRejectedValueOnce(new Error('transient'))
      .mockResolvedValue({ choices: [{ message: { content: 'ok' } }] });
    const openai = { chat: { completions: { create: mockCreate } } } as unknown as OpenAI;

    const result = await summarize(openai, 'text', { maxAttempts: 2, baseDelayMs: 0 });
    expect(result).toBe('ok');
    expect(mockCreate).toHaveBeenCalledTimes(2);
  });
});
