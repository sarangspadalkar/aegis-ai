import OpenAI from 'openai';
import { retryAsync } from '@aegis-ai/shared';
import type { RetryConfig } from '@aegis-ai/shared';

export async function summarize(openai: OpenAI, text: string, config: RetryConfig): Promise<string> {
  return retryAsync(async () => {
    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        {
          role: 'system',
          content: 'Summarize the following text concisely in 2-4 sentences. Output only the summary, no preamble.',
        },
        { role: 'user', content: text.slice(0, 12000) },
      ],
      max_tokens: 256,
    });
    const summary = completion.choices[0]?.message?.content?.trim();
    if (!summary) throw new Error('Empty summary response from OpenAI');
    return summary;
  }, config);
}
