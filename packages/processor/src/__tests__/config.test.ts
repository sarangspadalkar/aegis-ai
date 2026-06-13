import { describe, it, expect, vi } from 'vitest';

// Must run before the module is imported so the module-level `config = makeConfig()` doesn't throw
vi.hoisted(() => {
  process.env.OPENAI_SECRET_ARN = 'arn:aws:secretsmanager:us-east-1:dummy:secret:openai';
  process.env.DB_SECRET_ARN = 'arn:aws:secretsmanager:us-east-1:dummy:secret:db';
  process.env.DB_HOST = 'localhost';
});

import { makeConfig } from '../config';

describe('makeConfig', () => {
  const validEnv = {
    OPENAI_SECRET_ARN: 'arn:aws:secretsmanager:us-east-1:123:secret:openai',
    DB_SECRET_ARN: 'arn:aws:secretsmanager:us-east-1:123:secret:db',
    DB_HOST: 'db.example.com',
  };

  it('returns all config values from env', () => {
    const config = makeConfig({ ...validEnv, DB_NAME: 'mydb' });
    expect(config.openaiSecretArn).toBe(validEnv.OPENAI_SECRET_ARN);
    expect(config.dbSecretArn).toBe(validEnv.DB_SECRET_ARN);
    expect(config.dbHost).toBe(validEnv.DB_HOST);
    expect(config.dbName).toBe('mydb');
  });

  it('defaults dbName to "aegisai" when DB_NAME is absent', () => {
    const config = makeConfig(validEnv);
    expect(config.dbName).toBe('aegisai');
  });

  it('throws when OPENAI_SECRET_ARN is missing', () => {
    const { OPENAI_SECRET_ARN: _, ...rest } = validEnv;
    expect(() => makeConfig(rest)).toThrow('OPENAI_SECRET_ARN');
  });

  it('throws when DB_SECRET_ARN is missing', () => {
    const { DB_SECRET_ARN: _, ...rest } = validEnv;
    expect(() => makeConfig(rest)).toThrow('DB_SECRET_ARN');
  });

  it('throws when DB_HOST is missing', () => {
    const { DB_HOST: _, ...rest } = validEnv;
    expect(() => makeConfig(rest)).toThrow('DB_HOST');
  });

  it('returns correct retry defaults', () => {
    const config = makeConfig(validEnv);
    expect(config.maxOpenaiRetries).toBe(3);
    expect(config.openaiRetryDelayMs).toBe(1000);
  });
});
