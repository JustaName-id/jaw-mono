/**
 * The one race in `payment-lock` that cannot be driven from a single process.
 *
 * `withPaymentLock` reads the lock to decide it is stale, then `breakLock` reads
 * it again before unlinking. Both reads are synchronous with nothing in between,
 * so only another process can change the file there. That leaves mocking the
 * read as the only way to cover it, which is why this lives apart from
 * payment-lock.test.ts and its real filesystem.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as path from 'node:path';
import * as os from 'node:os';

const TEST_ROOT = path.join(os.tmpdir(), 'jaw-payment-lock-newborn-test');
const LOCK = path.join(TEST_ROOT, 'x402-payment.lock');

vi.mock('./paths.js', () => {
  const p = require('node:path');
  const o = require('node:os');
  const root = p.join(o.tmpdir(), 'jaw-payment-lock-newborn-test');
  return { PATHS: { root, config: p.join(root, 'config.json'), paymentLock: p.join(root, 'x402-payment.lock') } };
});

/** Reads of the lock file, so the test can answer the second one differently. */
let reads = 0;

vi.mock('node:fs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs')>();
  const readFileSync = ((target: unknown, ...rest: unknown[]) => {
    if (target === LOCK) {
      reads += 1;
      // First read: a readable, long-stale holder, so the loop breaks it.
      // Second read, inside breakLock: the holder released and a third payer
      // won the `wx`, its file created and not yet written.
      if (reads >= 2) return '';
      return JSON.stringify({ pid: 999_999, token: 'stale', at: Date.now() - 600_000 });
    }
    return (actual.readFileSync as (...a: unknown[]) => unknown)(target, ...rest);
  }) as typeof actual.readFileSync;
  return { ...actual, default: { ...actual, readFileSync }, readFileSync };
});

const fs = await import('node:fs');
const { withPaymentLock } = await import('./payment-lock.js');

beforeEach(() => {
  reads = 0;
  if (fs.existsSync(TEST_ROOT)) fs.rmSync(TEST_ROOT, { recursive: true });
  fs.mkdirSync(TEST_ROOT, { recursive: true });
  fs.writeFileSync(LOCK, 'placeholder, the mock decides what a read returns');
});
afterEach(() => {
  if (fs.existsSync(TEST_ROOT)) fs.rmSync(TEST_ROOT, { recursive: true });
});

describe('breakLock', () => {
  it('leaves the lock alone when the holder released and a third payer is mid-write', async () => {
    await expect(withPaymentLock(async () => 'we took it anyway', { timeoutMs: 250 })).rejects.toThrow();

    expect(reads).toBeGreaterThanOrEqual(2); // breakLock really did run
    expect(fs.existsSync(LOCK)).toBe(true); // and did not delete the newborn lock
  });
});
