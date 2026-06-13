import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { logger } from '../logger';

describe('logger', () => {
  beforeEach(() => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('info', () => {
    it('writes JSON to console.log with correct level and message', () => {
      logger.info('hello world');

      expect(console.log).toHaveBeenCalledOnce();
      const output = JSON.parse((console.log as ReturnType<typeof vi.fn>).mock.calls[0][0]);
      expect(output.level).toBe('info');
      expect(output.message).toBe('hello world');
    });

    it('includes a timestamp', () => {
      logger.info('msg');
      const output = JSON.parse((console.log as ReturnType<typeof vi.fn>).mock.calls[0][0]);
      expect(output.timestamp).toBeDefined();
      expect(() => new Date(output.timestamp)).not.toThrow();
    });

    it('spreads extra context into the log payload', () => {
      logger.info('msg', { jobId: 'abc', bucket: 'b' });
      const output = JSON.parse((console.log as ReturnType<typeof vi.fn>).mock.calls[0][0]);
      expect(output.jobId).toBe('abc');
      expect(output.bucket).toBe('b');
    });
  });

  describe('warn', () => {
    it('writes to console.warn', () => {
      logger.warn('uh oh');
      expect(console.warn).toHaveBeenCalledOnce();
      const output = JSON.parse((console.warn as ReturnType<typeof vi.fn>).mock.calls[0][0]);
      expect(output.level).toBe('warn');
      expect(output.message).toBe('uh oh');
    });
  });

  describe('error', () => {
    it('writes to console.error with error context', () => {
      logger.error('broke', { error: 'boom' });
      expect(console.error).toHaveBeenCalledOnce();
      const output = JSON.parse((console.error as ReturnType<typeof vi.fn>).mock.calls[0][0]);
      expect(output.level).toBe('error');
      expect(output.error).toBe('boom');
    });
  });

  describe('debug', () => {
    it('is suppressed at the default info level', () => {
      logger.debug('quiet');
      expect(console.log).not.toHaveBeenCalled();
    });
  });

  describe('jobLifecycle', () => {
    it('includes jobId and stage in the log payload', () => {
      logger.jobLifecycle('job-1', 'INGESTION', 'started');
      const output = JSON.parse((console.log as ReturnType<typeof vi.fn>).mock.calls[0][0]);
      expect(output.jobId).toBe('job-1');
      expect(output.stage).toBe('INGESTION');
      expect(output.message).toBe('started');
    });

    it('merges extra fields alongside jobId and stage', () => {
      logger.jobLifecycle('job-2', 'COMPLETED', 'done', { durationMs: 500 });
      const output = JSON.parse((console.log as ReturnType<typeof vi.fn>).mock.calls[0][0]);
      expect(output.durationMs).toBe(500);
      expect(output.jobId).toBe('job-2');
    });
  });
});
