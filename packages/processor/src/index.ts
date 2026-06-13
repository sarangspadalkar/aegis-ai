import type { SQSHandler } from 'aws-lambda';
import { SecretsManagerClient } from '@aws-sdk/client-secrets-manager';
import { S3Client } from '@aws-sdk/client-s3';
import type { PrismaClient } from '@aegis-ai/database';
import type OpenAI from 'openai';
import { getPrismaFromSecret } from '@aegis-ai/database';
import { config } from './config';
import { getOpenAIClient } from './openai-client';
import { createHandler } from './handler';

const secrets = new SecretsManagerClient({});
const s3 = new S3Client({});

let _prisma: PrismaClient | undefined;
let _openai: OpenAI | undefined;
let _handler: SQSHandler | undefined;

export const handler: SQSHandler = async (event, context, callback) => {
  if (!_handler) {
    _prisma = await getPrismaFromSecret(secrets, config.dbSecretArn, {
      host: config.dbHost,
      database: config.dbName,
    });
    _openai = await getOpenAIClient(secrets, config.openaiSecretArn);
    _handler = createHandler({ s3, openai: _openai, prisma: _prisma });
  }
  return _handler(event, context, callback);
};
