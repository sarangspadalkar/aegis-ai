import OpenAI from 'openai';
import { retryAsync } from '@aegis-ai/shared';
import type { RetryConfig } from '@aegis-ai/shared';

export async function getEmbedding(openai: OpenAI, text: string, config: RetryConfig): Promise<number[]> {
  return retryAsync(async () => {
    const res = await openai.embeddings.create({
      model: 'text-embedding-3-small',
      input: text.slice(0, 8000),
    });
    const embedding = res.data[0]?.embedding;
    if (!embedding || !Array.isArray(embedding)) throw new Error('Empty embedding response from OpenAI');
    return embedding;
  }, config);
}
