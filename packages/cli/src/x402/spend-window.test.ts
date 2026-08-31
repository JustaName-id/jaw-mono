import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { SessionConfig } from '../lib/session-config.js';
import type { X402Policy } from './policy.js';

/**
 * What `topUpCeiling` sizes refills from, and what `jaw x402 status` prints as
 * the remaining grant. The ledger's answer is a floor by construction: it sees
 * what went through `payAndFetch` and nothing else, so a pull made through
 * `jaw_rpc`, from a second machine, or by a write that never landed is missing
 * from it. The contract meters the real pull, so the undercount does not
 * overspend the allowance; it sends a userOp that reverts.
 */

const h = vi.hoisted(() => ({
  toppedUp: 0n,
  spent: 0n,
  onChain: { status: 'unavailable' } as
    | { status: 'ok'; start: number; end: number; spend: bigint }
    | { status: 'outside-window' }
    | { status: 'unavailable' },
  reads: 0,
}));

vi.mock('./ledger.js', () => ({
  sumToppedUpSince: () => h.toppedUp,
  sumSpentSince: () => h.spent,
}));

vi.mock('./permission-onchain.js', () => ({
  readCurrentPeriod: async () => {
    h.reads += 1;
    return h.onChain;
  },
}));

const { currentPeriodSpend, currentPeriodSpendOnChain } = await import('./spend-window.js');

const ANCHOR = new Date('2026-08-01T00:00:00.000Z');
const NOW = new Date('2026-08-01T06:00:00.000Z');
const CHAIN_WINDOW = { start: 1_754_006_400, end: 1_754_092_800 };

const POLICY: X402Policy = {
  maxPerPeriod: '5000000',
  period: { unit: 'day', multiplier: 1, anchor: ANCHOR.toISOString() },
};

const SESSION = {
  ownerAddress: '0x2222222222222222222222222222222222222222',
  sessionAddress: '0x1111111111111111111111111111111111111111',
  permissionId: '0xabc',
  chainId: 84532,
  expiry: Math.floor(NOW.getTime() / 1000) + 6 * 86400,
  createdAt: ANCHOR.toISOString(),
  mode: 'eip7702' as const,
  grantedSpend: {
    token: '0x036CbD53842c5426634e7929541eC2318f3dCF7e',
    allowance: '5000000',
    network: 'eip155:84532',
    unit: 'day' as const,
    multiplier: 1,
    periodAnchor: ANCHOR.toISOString(),
  },
} satisfies SessionConfig;

const PAYER = '0x1111111111111111111111111111111111111111';

beforeEach(() => {
  h.toppedUp = 0n;
  h.spent = 0n;
  h.onChain = { status: 'unavailable' };
  h.reads = 0;
});

describe('currentPeriodSpend', () => {
  it('marks the ledger as the source, because from there the figure is a floor', () => {
    h.toppedUp = 1_000_000n;
    expect(currentPeriodSpend(POLICY, PAYER, SESSION, NOW)).toMatchObject({ toppedUp: 1_000_000n, source: 'ledger' });
  });

  it('is null when no grant seeded a period, so only the session cap applies', () => {
    expect(currentPeriodSpend({}, PAYER, SESSION, NOW)).toBeNull();
  });
});

describe('currentPeriodSpendOnChain', () => {
  /**
   * The case the review named: a pull the ledger never saw. Reporting the
   * ledger's 1 against a 5 already gone would size the next refill against
   * budget that does not exist.
   */
  it('takes the chain figure when it is ahead of the ledger', async () => {
    h.toppedUp = 1_000_000n;
    h.onChain = { status: 'ok', ...CHAIN_WINDOW, spend: 5_000_000n };

    const period = await currentPeriodSpendOnChain(POLICY, PAYER, SESSION, NOW);
    expect(period).toMatchObject({ toppedUp: 5_000_000n, source: 'chain', window: CHAIN_WINDOW });
  });

  /**
   * The other direction, and the reason the two are combined rather than one
   * replacing the other: our own top-up is signed and not yet mined, so the
   * chain has not lost it yet and is about to.
   */
  it('keeps the ledger figure when it is ahead of the chain', async () => {
    h.toppedUp = 5_000_000n;
    h.onChain = { status: 'ok', ...CHAIN_WINDOW, spend: 0n };

    const period = await currentPeriodSpendOnChain(POLICY, PAYER, SESSION, NOW);
    // Reported as the ledger's, because that is what it is: our own estimate of
    // a pull that has not been mined. Calling it the chain's would let the
    // report print an estimate as a metered total. The window is still the
    // contract's either way.
    expect(period).toMatchObject({ toppedUp: 5_000_000n, source: 'ledger', window: CHAIN_WINDOW });
  });

  it('reports the chain as the source when the two agree', async () => {
    h.toppedUp = 5_000_000n;
    h.onChain = { status: 'ok', ...CHAIN_WINDOW, spend: 5_000_000n };
    expect(await currentPeriodSpendOnChain(POLICY, PAYER, SESSION, NOW)).toMatchObject({ source: 'chain' });
  });

  it('counts the ledger over the window the contract is actually in', async () => {
    h.onChain = { status: 'ok', ...CHAIN_WINDOW, spend: 0n };
    const period = await currentPeriodSpendOnChain(POLICY, PAYER, SESSION, NOW);
    expect(period?.window).toEqual(CHAIN_WINDOW);
  });

  it('falls back to the ledger when the node does not answer', async () => {
    h.toppedUp = 2_000_000n;
    const period = await currentPeriodSpendOnChain(POLICY, PAYER, SESSION, NOW);
    expect(period).toMatchObject({ toppedUp: 2_000_000n, source: 'ledger' });
  });

  // Expiry is reported on its own, and the local window still describes a
  // permission the contract will no longer meter.
  it('falls back to the ledger for a permission outside its own window', async () => {
    h.toppedUp = 2_000_000n;
    h.onChain = { status: 'outside-window' };
    const period = await currentPeriodSpendOnChain(POLICY, PAYER, SESSION, NOW);
    expect(period).toMatchObject({ toppedUp: 2_000_000n, source: 'ledger' });
  });

  it('does not read the chain for a session with no granted spend to meter', async () => {
    const withoutGrant = { ...SESSION, grantedSpend: undefined };
    const period = await currentPeriodSpendOnChain(POLICY, PAYER, withoutGrant, NOW);
    expect(period?.source).toBe('ledger');
    expect(h.reads).toBe(0);
  });

  it('does not read the chain when no period applies at all', async () => {
    expect(await currentPeriodSpendOnChain({}, PAYER, SESSION, NOW)).toBeNull();
    expect(h.reads).toBe(0);
  });
});
