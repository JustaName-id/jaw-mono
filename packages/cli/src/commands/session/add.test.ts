import { describe, it, expect, beforeAll, beforeEach, vi } from 'vitest';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Config } from '@oclif/core';

/**
 * An agent working under a scoped session that discovers it needs to pay could
 * only re-run setup, which revokes the grant it is working under: it loses its
 * other capabilities in the middle of the task. The only way to have both was
 * hand-writing the union, which means knowing the scope you already have.
 */

const USDC = '0x036CbD53842c5426634e7929541eC2318f3dCF7e';
const NFT = '0x4444444444444444444444444444444444444444';
const MINT = '0x1249c58b';

const h = vi.hoisted(() => ({
  config: { apiKey: 'k' } as Record<string, unknown>,
  session: {} as Record<string, unknown>,
  saved: null as Record<string, unknown> | null,
  requests: [] as Array<{ method: string; params: unknown }>,
  failRevoke: false,
  stderr: [] as string[],
}));

vi.mock('../../lib/config.js', () => ({ loadConfig: () => h.config }));
vi.mock('../../lib/keystore.js', () => ({ keystoreExists: () => true }));
vi.mock('../../lib/session-config.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../lib/session-config.js')>()),
  loadSessionConfig: () => h.session,
  saveSessionConfig: (config: Record<string, unknown>) => {
    h.saved = config;
  },
}));
vi.mock('../../lib/bridge-singleton.js', () => ({
  getBridge: async () => ({
    request: async (method: string, params: unknown) => {
      h.requests.push({ method, params });
      if (method === 'wallet_revokePermissions' && h.failRevoke) throw new Error('user rejected');
      if (method === 'wallet_grantPermissions') {
        return {
          account: '0x1111111111111111111111111111111111111111',
          spender: '0x2222222222222222222222222222222222222222',
          start: 1_756_000_000,
          end: 1_756_604_800,
          salt: '0xdef',
          calls: [
            { target: NFT, selector: MINT },
            { target: USDC, selector: '0xa9059cbb' },
          ],
          spends: [{ token: USDC, allowance: '0x989680', unit: 'day', multiplier: 1 }],
          permissionId: '0xnew',
          chainId: '0x14a34',
        };
      }
      return {};
    },
    close: () => undefined,
  }),
}));

const { default: SessionAdd } = await import('./add.js');

let oclifConfig: Config;

beforeAll(async () => {
  const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
  oclifConfig = await Config.load({ root: packageRoot });
});

beforeEach(() => {
  delete process.env.JAW_OUTPUT;
  delete process.env.JAW_CHAIN_ID;
  process.env.JAW_API_KEY = 'k';
  h.config = { apiKey: 'k' };
  h.saved = null;
  h.requests = [];
  h.failRevoke = false;
  h.stderr = [];
  h.session = {
    ownerAddress: '0x1111111111111111111111111111111111111111',
    sessionAddress: '0x2222222222222222222222222222222222222222',
    permissionId: '0xold',
    chainId: 84532,
    expiry: Math.floor(Date.now() / 1000) + 6 * 86400,
    createdAt: new Date().toISOString(),
    mode: 'eip7702',
    permission: {
      account: '0x1111111111111111111111111111111111111111',
      spender: '0x2222222222222222222222222222222222222222',
      start: 1_756_000_000,
      end: 1_756_604_800,
      salt: '0xabc',
      calls: [{ target: NFT, selector: MINT }],
      spends: [],
    },
  };
});

async function runAdd(argv: string[]): Promise<string[]> {
  const cmd = new SessionAdd(argv, oclifConfig);
  const lines: string[] = [];
  Object.assign(cmd, {
    log: (message?: string) => {
      lines.push(String(message ?? ''));
    },
    logToStderr: (message?: string) => {
      h.stderr.push(String(message ?? ''));
    },
  });
  await cmd.run();
  return lines;
}

const granted = () => h.requests.find((r) => r.method === 'wallet_grantPermissions');

describe('jaw session add', () => {
  it('grants the union and keeps the session key', async () => {
    await runAdd(['--x402', '--limit', '10/day']);

    const params = (granted()?.params as Array<Record<string, unknown>>)[0];
    expect(params.spender).toBe('0x2222222222222222222222222222222222222222');
    const permissions = params.permissions as { calls: unknown[]; spends: unknown[] };
    expect(permissions.calls).toHaveLength(2);
    expect(permissions.spends).toEqual([{ token: USDC, allowance: '10000000', unit: 'day', multiplier: 1 }]);
  });

  /**
   * Granted before the old one is revoked, so the agent is never left without a
   * permission: a failure in between leaves it holding what it had.
   */
  it('grants before it revokes, and revokes the old one', async () => {
    await runAdd(['--x402']);
    expect(h.requests.map((r) => r.method)).toEqual(['wallet_grantPermissions', 'wallet_revokePermissions']);
    expect((h.requests[1].params as Array<{ id: string }>)[0].id).toBe('0xold');
    expect(h.saved?.permissionId).toBe('0xnew');
    expect(h.saved?.orphanedPermissions).toBeUndefined();
  });

  /**
   * The new permission is live by then, so the session has to record it. The old
   * one stays live until it expires, and it is recorded so `session revoke` can
   * still reach it, which is the same machinery a declined revoke in setup uses.
   */
  it('records the old permission when revoking it failed', async () => {
    h.failRevoke = true;
    await runAdd(['--x402']);

    expect(h.saved?.permissionId).toBe('0xnew');
    expect(h.saved?.orphanedPermissions).toEqual([{ id: '0xold', chainId: 84532, expiry: h.session.expiry }]);
    expect(h.stderr.join(' ')).toMatch(/revoking the old one failed/);
  });

  it('does nothing when the session already allows all of it', async () => {
    const lines = await runAdd(['--permissions', JSON.stringify({ calls: [{ target: NFT, selector: MINT }] })]);
    expect(lines.join(' ')).toMatch(/already allows all of this/);
    expect(h.requests).toEqual([]);
  });

  /**
   * The union needs the scope already granted, and only the stored struct has
   * it. A session written before that field keeps working, it just cannot be
   * merged against.
   */
  it('refuses a session that does not carry its granted permission', async () => {
    delete h.session.permission;
    await expect(runAdd(['--x402'])).rejects.toThrow(/does not carry the permission it was granted/);
    expect(h.requests).toEqual([]);
  });

  it('refuses an expired session, which has nothing to add to', async () => {
    h.session.expiry = Math.floor(Date.now() / 1000) - 10;
    await expect(runAdd(['--x402'])).rejects.toThrow(/expired/);
  });

  // The ceiling bounds what the merge asks for, not just what setup does.
  it('refuses a merge that goes over the grant ceiling', async () => {
    h.config = { apiKey: 'k', grantCeiling: '5/day' };
    await expect(runAdd(['--x402', '--limit', '10/day'])).rejects.toThrow(/over the 5\/day ceiling/);
    expect(h.requests).toEqual([]);
  });

  it('refuses when nothing was asked for', async () => {
    await expect(runAdd([])).rejects.toThrow(/Nothing to add/);
  });
});
