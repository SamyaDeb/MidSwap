/**
 * Production-ready logger for MidSwap SDK
 * Respects LOG_LEVEL environment variable
 */

export type LogLevel = 'debug' | 'info' | 'warn' | 'error' | 'silent';

const LOG_LEVELS: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
  silent: 4
};

class Logger {
  private level: LogLevel;
  private prefix = '[MidSwap]';

  constructor() {
    // Default to 'warn' in production, 'debug' in development
    const envLevel = typeof process !== 'undefined' 
      ? (process.env?.MIDSWAP_LOG_LEVEL || process.env?.LOG_LEVEL)
      : undefined;
    
    this.level = (envLevel as LogLevel) || 
      (typeof process !== 'undefined' && process.env?.NODE_ENV === 'production' ? 'warn' : 'info');
  }

  setLevel(level: LogLevel): void {
    this.level = level;
  }

  private shouldLog(level: LogLevel): boolean {
    return LOG_LEVELS[level] >= LOG_LEVELS[this.level];
  }

  debug(message: string, ...args: unknown[]): void {
    if (this.shouldLog('debug')) {
      console.debug(`${this.prefix} ${message}`, ...args);
    }
  }

  info(message: string, ...args: unknown[]): void {
    if (this.shouldLog('info')) {
      console.info(`${this.prefix} ${message}`, ...args);
    }
  }

  warn(message: string, ...args: unknown[]): void {
    if (this.shouldLog('warn')) {
      console.warn(`${this.prefix} ${message}`, ...args);
    }
  }

  error(message: string, ...args: unknown[]): void {
    if (this.shouldLog('error')) {
      console.error(`${this.prefix} ${message}`, ...args);
    }
  }
}

export const logger = new Logger();
