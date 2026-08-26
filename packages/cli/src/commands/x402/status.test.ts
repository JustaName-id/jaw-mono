import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { fileURLToPath } from 'node:url';
import { Config } from '@oclif/core';

/**
 * Pins the wiring between the ledger's two meters and what `jaw x402 status`
 * reports. The primitives (`diagnose`, `sumToppedUpSince`) have their own
 * tests; what once regressed was which field this command fed them: the period
 * figure read payments while the on-chain allowance is drawn down by top-ups,
 * so one top-up at the grant's size left the report quiet and `ready: true`
 * while every further refill was already impossible.
 *
 * The scenario is the one from that report: a 5 USDC/day grant, a single
 * 0.1 USDC payment funded by a 5 USDC top-up. The period figure must show the
 * 5 the chain lost, not the 0.1 the payer spent.
 */

const TEST_ROOT = path.join(os.tmpdir(), 'jaw-status-cmd-test');

const h = vi.hoisted(() => {
  // One hour back, so "now" falls inside the first period window.
  const anchor = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  return {
    payer: '0x1111111111111111111111111111111111111111' as const,
    session: {
      ownerAddress: '0x2222222222222222222222222222222222222222',
      sessionAddress: '0x1111111111111111111111111111111111111111',
      permissionId: '0xabc',
      chainId: 84532,
      expiry: Math.floor(Date.now() / 1000) + 6 * 86400,
      createdAt: anchor,
      mode: 'eip7702' as const,
      grantedSpend: {
        // Registry USDC on Base Sepolia, so the asset lookup resolves.
        token: '0x036CbD53842c5426634e7929541eC2318f3dCF7e',
        allowance: '5000000', // 5 USDC per day
        network: 'eip155:84532',
        unit: 'day' as const,
        multiplier: 1,
        periodAnchor: anchor,
      },
    },
  };
});

vi.mock('../../lib/paths.js', () => {
  const p = require('node:path');
  const o = require('node:os');
  const root = p.join(o.tmpdir(), 'jaw-status-cmd-test');
  return { PATHS: { root, x402Log: p.join(root, 'x402-log.jsonl') } };
});

vi.mock('../../lib/keystore.js', () => ({ keystoreExists: () => true }));

vi.mock('../../lib/config.js', () => ({
  loadConfig: () => ({ x402: { topUpFloat: '5000000' } }),
  ensureDir: (dir: string) => {
    require('node:fs').mkdirSync(dir, { recursive: true });
  },
}));

vi.mock('../../lib/session-config.js', () => ({
  tryLoadSessionConfig: () => h.session,
  isLegacySession: () => false,
}));

vi.mock('../../x402/payer.js', () => ({ sessionPayerAddress: () => h.payer }));

// Both balances funded and readable: the only problem left for `diagnose` to
// find is the one this file exists to pin.
vi.mock('../../x402/balance.js', () => ({ usdcBalance: async () => ({ formatted: '20' }) }));

const { appendX402Log } = await import('../../x402/ledger.js');
const { default: X402Status } = await import('./status.js');

let oclifConfig: Config;

beforeAll(async () => {
  const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
  oclifConfig = await Config.load({ root: packageRoot });
});

beforeEach(() => {
  // The base flags read these, and an inherited value would override the argv
  // the tests pass.
  delete process.env.JAW_OUTPUT;
  delete process.env.JAW_CHAIN_ID;
  delete process.env.JAW_API_KEY;
  if (fs.existsSync(TEST_ROOT)) fs.rmSync(TEST_ROOT, { recursive: true });
  fs.mkdirSync(TEST_ROOT, { recursive: true });
  appendX402Log({
    at: new Date().toISOString(),
    url: 'https://api.example.com/tool',
    payer: h.payer,
    status: 'paid',
    amount: '100000', // 0.1 USDC paid out...
    topUpAmount: '5000000', // ...behind a 5 USDC pull through the permission
  });
});

afterEach(() => {
  if (fs.existsSync(TEST_ROOT)) fs.rmSync(TEST_ROOT, { recursive: true });
});

async function runStatus(argv: string[]): Promise<string[]> {
  const cmd = new X402Status(argv, oclifConfig);
  const lines: string[] = [];
  Object.assign(cmd, {
    log: (message?: string) => {
      lines.push(String(message ?? ''));
    },
  });
  await cmd.run();
  return lines;
}

describe('jaw x402 status', () => {
  it('reports the period figure from top-ups and the session figure from payments', async () => {
    const result = JSON.parse((await runStatus(['--output', 'json'])).join('\n'));
    expect(result.spentThisPeriod).toBe('5000000');
    expect(result.spentThisSession).toBe('100000');
    expect(result.policy.maxPerPeriod).toBe('5000000');
  });

  it('flags the drained grant and flips ready, even though payments barely started', async () => {
    const result = JSON.parse((await runStatus(['--output', 'json'])).join('\n'));
    expect(result.ready).toBe(false);
    expect(result.problems).toHaveLength(1);
    expect(result.problems[0]).toMatch(/granted allowance for this day is used up/);
  });

  it('prints the drained grant as used, apart from the session spend', async () => {
    const output = (await runStatus([])).join('\n');
    expect(output).toContain('at least 5 USDC of 5 USDC used this day');
    expect(output).toContain('at least 0.1 USDC of unlimited spent this session');
  });
});
