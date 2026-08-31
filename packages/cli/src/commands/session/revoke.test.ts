import { describe, it, expect, beforeAll, beforeEach, vi } from 'vitest';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Config } from '@oclif/core';

/**
 * `session setup` replaces a session rather than adding to it, and it does not
 * always revoke what it replaces: the interactive path takes no for an answer,
 * and `--yes` never revokes. The session key is reused by default, so the
 * spender ends up holding two live grants while the config names one, and its
 * real authority is the sum.
 *
 * Setup now records the id it stops tracking, and this is the command that has
 * to act on it. Before that record existed, the id was gone with the
 * overwritten config and nothing could reach the permission again.
 */

const h = vi.hoisted(() => ({
  session: {
    ownerAddress: '0x2222222222222222222222222222222222222222',
    sessionAddress: '0x1111111111111111111111111111111111111111',
    permissionId: '0xcurrent',
    chainId: 84532,
    expiry: Math.floor(Date.now() / 1000) + 6 * 86400,
    createdAt: new Date().toISOString(),
    mode: 'eip7702' as const,
    orphanedPermissions: [] as Array<{ id: string; chainId: number; expiry: number }>,
  },
  deleted: { keystore: false, config: false },
  saved: [] as Array<Array<{ id: string }>>,
  requests: [] as Array<{ chainId: number; method: string; params: unknown }>,
  bridges: 0,
  failOn: null as string | null,
}));

vi.mock('../../lib/config.js', () => ({ loadConfig: () => ({ apiKey: 'k' }) }));

vi.mock('../../lib/keystore.js', () => ({
  keystoreExists: () => true,
  deleteKeystore: () => {
    h.deleted.keystore = true;
  },
}));

vi.mock('../../lib/session-config.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../lib/session-config.js')>()),
  loadSessionConfig: () => h.session,
  deleteSessionConfig: () => {
    h.deleted.config = true;
  },
  saveOrphanedPermissions: (_config: unknown, orphans: Array<{ id: string }>) => {
    h.saved.push(orphans);
  },
}));

vi.mock('../../lib/bridge-singleton.js', () => ({
  getBridge: async ({ chainId }: { chainId: number }) => {
    h.bridges += 1;
    return {
      request: async (method: string, params: unknown) => {
        const id = (params as Array<{ id: string }>)[0]?.id;
        if (h.failOn && id === h.failOn) throw new Error('user rejected');
        h.requests.push({ chainId, method, params });
        return {};
      },
      close: () => undefined,
    };
  },
}));

const { default: SessionRevoke } = await import('./revoke.js');

let oclifConfig: Config;

beforeAll(async () => {
  const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
  oclifConfig = await Config.load({ root: packageRoot });
});

beforeEach(() => {
  delete process.env.JAW_OUTPUT;
  delete process.env.JAW_CHAIN_ID;
  process.env.JAW_API_KEY = 'k';
  h.session.expiry = Math.floor(Date.now() / 1000) + 6 * 86400;
  h.session.orphanedPermissions = [];
  h.deleted = { keystore: false, config: false };
  h.saved = [];
  h.requests = [];
  h.bridges = 0;
  h.failOn = null;
});

async function runRevoke(argv: string[] = []): Promise<string[]> {
  const cmd = new SessionRevoke(argv, oclifConfig);
  const lines: string[] = [];
  Object.assign(cmd, {
    log: (message?: string) => {
      lines.push(String(message ?? ''));
    },
  });
  await cmd.run();
  return lines;
}

const revokedIds = () => h.requests.map((r) => (r.params as Array<{ id: string }>)[0].id);

describe('jaw session revoke', () => {
  it('revokes the permission the session names', async () => {
    await runRevoke();
    expect(revokedIds()).toEqual(['0xcurrent']);
    expect(h.deleted).toEqual({ keystore: true, config: true });
  });

  it('also revokes the permissions the key holds that the session does not name', async () => {
    h.session.orphanedPermissions = [{ id: '0xorphan', chainId: 84532, expiry: Math.floor(Date.now() / 1000) + 86400 }];
    await runRevoke();
    expect(revokedIds()).toEqual(['0xorphan', '0xcurrent']);
  });

  /**
   * Setup takes `--chain`, so replacing a session can move it and leave the old
   * permission on the chain it was granted on. One bridge per chain, because a
   * revoke sent to the wrong one reaches a manager that never saw the hash.
   */
  it('opens one browser per chain when an orphan sits on another one', async () => {
    h.session.orphanedPermissions = [{ id: '0xorphan', chainId: 8453, expiry: Math.floor(Date.now() / 1000) + 86400 }];
    await runRevoke();
    expect(h.bridges).toBe(2);
    expect(h.requests.map((r) => r.chainId)).toEqual([8453, 84532]);
  });

  // An expired permission authorises nothing, so opening a window to revoke it
  // is worse than saying nothing, which is the call this command already made
  // for an expired session.
  it('skips an expired orphan', async () => {
    h.session.orphanedPermissions = [{ id: '0xstale', chainId: 84532, expiry: Math.floor(Date.now() / 1000) - 10 }];
    await runRevoke();
    expect(revokedIds()).toEqual(['0xcurrent']);
  });

  it('still revokes a live orphan when the session itself has expired', async () => {
    h.session.expiry = Math.floor(Date.now() / 1000) - 10;
    h.session.orphanedPermissions = [{ id: '0xorphan', chainId: 84532, expiry: Math.floor(Date.now() / 1000) + 86400 }];
    await runRevoke();
    expect(revokedIds()).toEqual(['0xorphan']);
    expect(h.deleted).toEqual({ keystore: true, config: true });
  });

  it('touches nothing on chain when everything has expired', async () => {
    h.session.expiry = Math.floor(Date.now() / 1000) - 10;
    await runRevoke();
    expect(h.bridges).toBe(0);
    expect(h.deleted).toEqual({ keystore: true, config: true });
  });

  /**
   * The local files are what makes the remaining permission reachable. Deleting
   * them after a partial revoke would strand it exactly the way an unrecorded
   * orphan was stranded before.
   */
  it('keeps the local files when a revoke did not go through', async () => {
    h.session.orphanedPermissions = [{ id: '0xorphan', chainId: 84532, expiry: Math.floor(Date.now() / 1000) + 86400 }];
    h.failOn = '0xorphan';
    await expect(runRevoke()).rejects.toThrow(/user rejected/);
    expect(revokedIds()).toEqual([]);
    expect(h.deleted).toEqual({ keystore: false, config: false });
  });

  /**
   * Revoking is not idempotent: core reads the permission from the relay before
   * sending and deletes it from there afterwards, so a second attempt at an id
   * already revoked fails before it sends anything. Every state this command
   * can stop in therefore has to name only ids that are still live, or the
   * retry dies on a stale one before reaching what it was run for.
   */
  it('drops each orphan from the session as it goes, so a later failure stays retryable', async () => {
    h.session.orphanedPermissions = [
      { id: '0xorphanA', chainId: 84532, expiry: Math.floor(Date.now() / 1000) + 86400 },
      { id: '0xorphanB', chainId: 84532, expiry: Math.floor(Date.now() / 1000) + 86400 },
    ];
    h.failOn = '0xcurrent';

    await expect(runRevoke()).rejects.toThrow(/user rejected/);

    expect(revokedIds()).toEqual(['0xorphanA', '0xorphanB']);
    // Written after each one, and the last write names nothing still to do:
    // the only permission left is the one the config already names.
    expect(h.saved.map((orphans) => orphans.map((o) => o.id))).toEqual([['0xorphanB'], []]);
    expect(h.deleted).toEqual({ keystore: false, config: false });
  });

  it('does not rewrite the session when there was nothing orphaned to drop', async () => {
    await runRevoke();
    expect(h.saved).toEqual([]);
  });
});
