/**
 * Development-only logger. No-ops in production so the keys app doesn't spray
 * trace logs into the console of any dApp that embeds it as an iframe (which
 * is visible to the host page and its extensions).
 *
 * Use this for debug/trace output. Keep `console.error`/`console.warn` for
 * real, actionable problems.
 */
const isDev = process.env.NODE_ENV !== 'production';

export function debugLog(...args: unknown[]): void {
  if (isDev) console.log(...args);
}
