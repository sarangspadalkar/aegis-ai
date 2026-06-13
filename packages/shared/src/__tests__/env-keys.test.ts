import { describe, it, expect } from 'vitest';
import { requireEnv } from '../env-keys';

describe('requireEnv', () => {
  it('returns the value when the env var is present', () => {
    expect(requireEnv('KEY', { KEY: 'val' })).toBe('val');
  });

  it('throws when the env var is missing', () => {
    expect(() => requireEnv('MISSING', {})).toThrow('Missing required env var: MISSING');
  });

  it('throws when the env var is an empty string', () => {
    expect(() => requireEnv('EMPTY', { EMPTY: '' })).toThrow('Missing required env var: EMPTY');
  });

  it('includes the var name in the error message', () => {
    expect(() => requireEnv('MY_VAR', {})).toThrow('MY_VAR');
  });
});
