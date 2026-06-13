import { describe, it, expect } from 'vitest';
import { buildDatabaseUrl } from '../url';

describe('buildDatabaseUrl', () => {
  it('builds a valid postgresql URL', () => {
    const url = buildDatabaseUrl({
      host: 'localhost',
      username: 'user',
      password: 'pass',
      database: 'mydb',
    });
    expect(url).toBe('postgresql://user:pass@localhost:5432/mydb?schema=public');
  });

  it('defaults port to 5432', () => {
    const url = buildDatabaseUrl({ host: 'h', username: 'u', password: 'p', database: 'd' });
    expect(url).toContain(':5432/');
  });

  it('uses a custom port when provided', () => {
    const url = buildDatabaseUrl({
      host: 'h',
      port: 5433,
      username: 'u',
      password: 'p',
      database: 'd',
    });
    expect(url).toContain(':5433/');
  });

  it('defaults schema to public', () => {
    const url = buildDatabaseUrl({ host: 'h', username: 'u', password: 'p', database: 'd' });
    expect(url).toContain('?schema=public');
  });

  it('uses a custom schema when provided', () => {
    const url = buildDatabaseUrl({
      host: 'h',
      username: 'u',
      password: 'p',
      database: 'd',
      schema: 'myschema',
    });
    expect(url).toContain('?schema=myschema');
  });

  it('URI-encodes special characters in the password', () => {
    const url = buildDatabaseUrl({
      host: 'h',
      username: 'u',
      password: 'p@ss/w0rd!',
      database: 'd',
    });
    expect(url).toContain('p%40ss%2Fw0rd!');
    expect(url).not.toContain('p@ss');
  });
});
