import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';

const TEST_ROOT = path.join(os.tmpdir(), 'jaw-ledger-spend-test');

vi.mock('../lib/paths.js', () => {
  const p = require('node:path');
  const o = require('node:os');
  const root = p.join(o.tmpdir(), 'jaw-ledger-spend-test');
  return { PATHS: { root, x402Log: p.join(root, 'x402-log.jsonl') } };
});

const { appendX402Log, sumSpentSince } = await import('./ledger.js');

const PAYER = '0x1111111111111111111111111111111111111111';
const OTHER = '0x2222222222222222222222222222222222222222';

beforeEach(() => {
  if (fs.existsSync(TEST_ROOT)) fs.rmSync(TEST_ROOT, { recursive: true });
  fs.mkdirSync(TEST_ROOT, { recursive: true });
});
afterEach(() => {
  if (fs.existsSync(TEST_ROOT)) fs.rmSync(TEST_ROOT, { recursive: true });
});

const entry = (o: Partial<Parameters<typeof appendX402Log>[0]>) =>
  appendX402Log({
    at: '2026-02-01T00:00:00.000Z',
    url: 'https://api.example.com/x',
    payer: PAYER,
    status: 'paid',
    amount: '1000',
    ...o,
  } as Parameters<typeof appendX402Log>[0]);

describe('sumSpentSince', () => {
  it('adds settled payments for this payer', () => {
    entry({});
    entry({ amount: '2500' });
    expect(sumSpentSince(PAYER)).toBe(3500n);
  });

  // A signed authorization may have been broadcast even when settlement did not
  // confirm, so counting it can only under-spend the cap, never breach it.
  it('counts failed attempts, not refusals', () => {
    entry({ status: 'failed', amount: '1000' });
    entry({ status: 'refused', amount: '9999' });
    expect(sumSpentSince(PAYER)).toBe(1000n);
  });

  it('ignores other payers', () => {
    entry({ payer: OTHER, amount: '5000' });
    expect(sumSpentSince(PAYER)).toBe(0n);
  });

  it('matches the payer case-insensitively', () => {
    entry({ payer: PAYER.toUpperCase().replace('0X', '0x') });
    expect(sumSpentSince(PAYER)).toBe(1000n);
  });

  it('scopes to entries at or after the cutoff', () => {
    entry({ at: '2026-01-01T00:00:00.000Z', amount: '4000' });
    entry({ at: '2026-03-01T00:00:00.000Z', amount: '1000' });
    expect(sumSpentSince(PAYER, '2026-02-01T00:00:00.000Z')).toBe(1000n);
    expect(sumSpentSince(PAYER)).toBe(5000n);
  });

  it('skips a hand-edited amount instead of taking the cap down', () => {
    entry({ amount: 'not-a-number' });
    entry({ amount: '1000' });
    expect(sumSpentSince(PAYER)).toBe(1000n);
  });

  it('is zero on an empty ledger', () => {
    expect(sumSpentSince(PAYER)).toBe(0n);
  });
});
