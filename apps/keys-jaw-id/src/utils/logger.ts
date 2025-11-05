/**
 * Conditional logger that only logs in development mode
 * Helps reduce memory usage from console logs in production
 */

const isDev = process.env.NODE_ENV === 'development' || process.env.NODE_ENV === 'test';

export const logger = {
  log: (...args: any[]) => {
    if (isDev) console.log(...args);
  },
  error: (...args: any[]) => {
    // Always log errors
    console.error(...args);
  },
  warn: (...args: any[]) => {
    if (isDev) console.warn(...args);
  },
  info: (...args: any[]) => {
    if (isDev) console.info(...args);
  },
  debug: (...args: any[]) => {
    if (isDev) console.debug(...args);
  }
};