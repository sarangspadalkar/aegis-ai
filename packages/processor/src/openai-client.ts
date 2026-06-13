import { SecretsManagerClient, GetSecretValueCommand } from '@aws-sdk/client-secrets-manager';
import OpenAI from 'openai';

export async function getOpenAIClient(
  secrets: SecretsManagerClient,
  secretArn: string
): Promise<OpenAI> {
  const res = await secrets.send(new GetSecretValueCommand({ SecretId: secretArn }));
  const secret = JSON.parse(res.SecretString ?? '{}') as { OPENAI_API_KEY?: string };
  const apiKey = secret.OPENAI_API_KEY ?? process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error('OpenAI API key not found in secret or env');
  return new OpenAI({ apiKey });
}
