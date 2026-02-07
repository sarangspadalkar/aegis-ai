/**
 * Structured logger for observability across the pipeline.
 * Tracks job lifecycle from ingestion to completion.
 */

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export interface LogContext {
  jobId?: string;
  bucket?: string;
  key?: string;
  stage?: string;
  durationMs?: number;
  retryCount?: number;
  error?: string;
  [key: string]: unknown;
}

const LOG_LEVEL_ORDER: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

const minLevel: LogLevel = (process.env.LOG_LEVEL as LogLevel) || 'info';

function shouldLog(level: LogLevel): boolean {
  return LOG_LEVEL_ORDER[level] >= LOG_LEVEL_ORDER[minLevel];
}

function formatLog(level: LogLevel, message: string, context?: LogContext): string {
  const payload = {
    timestamp: new Date().toISOString(),
    level,
    message,
    ...context,
  };
  return JSON.stringify(payload);
}

export const logger = {
  debug(message: string, context?: LogContext): void {
    if (shouldLog('debug')) {
      console.log(formatLog('debug', message, context));
    }
  },

  info(message: string, context?: LogContext): void {
    if (shouldLog('info')) {
      console.log(formatLog('info', message, context));
    }
  },

  warn(message: string, context?: LogContext): void {
    if (shouldLog('warn')) {
      console.warn(formatLog('warn', message, context));
    }
  },

  error(message: string, context?: LogContext): void {
    if (shouldLog('error')) {
      console.error(formatLog('error', message, context));
    }
  },

  jobLifecycle(
    jobId: string,
    stage: string,
    message: string,
    extra?: Omit<LogContext, 'jobId' | 'stage'>
  ): void {
    this.info(message, { jobId, stage, ...extra });
  },
};
