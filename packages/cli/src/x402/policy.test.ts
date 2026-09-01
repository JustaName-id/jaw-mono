import { describe, it, expect } from 'vitest';

const BASE = 8453;
const BASE_USDC = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913';

/**
 * A granted permission, which is now the only place a policy is derived from.
 * The session used to also carry a `grantedSpend` summary of one limit, and the
 * two could describe different budgets; deriving on read removes the question.
 */
function permissionWith(spends: Array<{ allowance: string; unit: string; multiplier?: number; token?: string }>) {
  return {
    account: '0x1111111111111111111111111111111111111111',
    spender: '0x2222222222222222222222222222222222222222',
    start: Math.floor(new Date('2026-01-01T00:00:00.000Z').getTime() / 1000),
    end: Math.floor(new Date('2026-02-01T00:00:00.000Z').getTime() / 1000),
    salt: '0xabc',
    calls: [{ target: BASE_USDC, selector: '0xa9059cbb' }],
    spends: spends.map((s) => ({
      token: s.token ?? BASE_USDC,
      allowance: s.allowance,
      unit: s.unit,
      multiplier: s.multiplier ?? 1,
    })),
  };
}

import {
  checkPolicy,
  resolveX402Policy,
  policyFromPermission,
  DEFAULT_X402_POLICY,
  isX402PolicyKey,
  X402_SCALAR_KEYS,
  resolveSessionX402Policy,
  topUpCeiling,
} from './policy.js';
import type { X402PaymentRequirement } from './types.js';

const base: X402PaymentRequirement = {
  scheme: 'exact',
  network: 'eip155:8453',
  amount: '1000',
  asset: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
  payTo: '0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC',
  maxTimeoutSeconds: 60,
};

describe('checkPolicy', () => {
  it('allows a payment under an empty policy', () => {
    expect(checkPolicy(base, {})).toEqual({ ok: true });
  });

  it('rejects a non-exact scheme', () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect(checkPolicy({ ...base, scheme: 'upto' as any }, {}).ok).toBe(false);
  });

  it('enforces maxAmountPerPayment', () => {
    expect(checkPolicy(base, { maxAmountPerPayment: '999' }).ok).toBe(false);
    expect(checkPolicy(base, { maxAmountPerPayment: '1000' }).ok).toBe(true);
  });

  it('enforces maxTotalPerSession against prior spend', () => {
    expect(checkPolicy(base, { maxTotalPerSession: '1500' }, { spentThisSession: 600n }).ok).toBe(false);
    expect(checkPolicy(base, { maxTotalPerSession: '1500' }, { spentThisSession: 500n }).ok).toBe(true);
  });

  it('enforces allowedNetworks', () => {
    expect(checkPolicy(base, { allowedNetworks: ['eip155:84532'] }).ok).toBe(false);
    expect(checkPolicy(base, { allowedNetworks: ['eip155:8453'] }).ok).toBe(true);
  });

  it('enforces allowedAssets case-insensitively', () => {
    expect(checkPolicy(base, { allowedAssets: [base.asset.toLowerCase()] }).ok).toBe(true);
    expect(checkPolicy(base, { allowedAssets: ['0x0000000000000000000000000000000000000bad'] }).ok).toBe(false);
  });

  it('enforces allowedPayTo case-insensitively', () => {
    expect(checkPolicy(base, { allowedPayTo: [base.payTo.toLowerCase()] }).ok).toBe(true);
    expect(checkPolicy(base, { allowedPayTo: ['0x0000000000000000000000000000000000000000'] }).ok).toBe(false);
  });

  it('enforces allowedHosts against the context host', () => {
    expect(checkPolicy(base, { allowedHosts: ['api.example.com'] }, { host: 'evil.com' }).ok).toBe(false);
    expect(checkPolicy(base, { allowedHosts: ['api.example.com'] }, { host: 'api.example.com' }).ok).toBe(true);
    expect(checkPolicy(base, { allowedHosts: ['api.example.com'] }, {}).ok).toBe(false);
  });

  it('rejects an invalid or negative amount', () => {
    expect(checkPolicy({ ...base, amount: 'abc' }, {}).ok).toBe(false);
    expect(checkPolicy({ ...base, amount: '-1' }, {}).ok).toBe(false);
  });

  it('refuses cleanly (no throw) on a malformed policy cap', () => {
    expect(checkPolicy(base, { maxAmountPerPayment: 'not-a-number' })).toEqual({
      ok: false,
      reason: expect.stringContaining('invalid maxAmountPerPayment'),
    });
    expect(checkPolicy(base, { maxTotalPerSession: 'oops' }).ok).toBe(false);
  });
});

describe('resolveX402Policy', () => {
  it('applies conservative defaults when nothing is configured', () => {
    expect(resolveX402Policy()).toEqual(DEFAULT_X402_POLICY);
    expect(resolveX402Policy().maxAmountPerPayment).toBe('1000000'); // 1 USDC
  });

  it('lets config override a default per field', () => {
    const policy = resolveX402Policy({ maxAmountPerPayment: '50' });
    expect(policy.maxAmountPerPayment).toBe('50');
    expect(policy.maxTotalPerSession).toBe(DEFAULT_X402_POLICY.maxTotalPerSession);
  });

  it('defaults restrict assets and networks to the USDC registry', () => {
    const policy = resolveX402Policy();
    expect(policy.allowedNetworks).toContain('eip155:8453');
    expect(policy.allowedAssets).toContain('0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913');
    // An unconfigured setup pays the known USDC but refuses any other token a
    // server may ask for, even on an allowed network.
    expect(checkPolicy(base, policy).ok).toBe(true);
    expect(checkPolicy({ ...base, asset: '0x0000000000000000000000000000000000000bad' }, policy).ok).toBe(false);
    expect(checkPolicy({ ...base, network: 'eip155:1' }, policy).ok).toBe(false);
  });
});

describe('policyFromPermission', () => {
  it('returns an empty policy when the session carries no permission', () => {
    expect(policyFromPermission(undefined, BASE)).toEqual({});
  });

  it('seeds the per-period cap, the allowlists and the anchor from the permission', () => {
    expect(policyFromPermission(permissionWith([{ allowance: '5000000', unit: 'day' }]), BASE)).toEqual({
      maxPerPeriod: '5000000',
      allowedAssets: [BASE_USDC],
      allowedNetworks: ['eip155:8453'],
      period: { unit: 'day', multiplier: 1, anchor: '2026-01-01T00:00:00.000Z' },
    });
  });

  /**
   * The contract charges every limit matching a token, so what a single number
   * can stand for is the one a pull is refused against. Taking whichever came
   * first reported a hundred times the headroom that exists.
   */
  it('seeds from the limit that binds when the permission carries several', () => {
    const policy = policyFromPermission(
      permissionWith([
        { allowance: '100000000', unit: 'month' },
        { allowance: '1000000', unit: 'day' },
      ]),
      BASE
    );
    expect(policy.maxPerPeriod).toBe('1000000');
    expect(policy.period?.unit).toBe('day');
  });

  // The SDK rewrites `year` to months before encoding, so the local window has
  // to land where the permission actually enforces it.
  it('normalises a yearly grant to the months the contract stores', () => {
    const policy = policyFromPermission(permissionWith([{ allowance: '5000000', unit: 'year', multiplier: 2 }]), BASE);
    expect(policy.period).toMatchObject({ unit: 'month', multiplier: 24 });
  });

  it('ignores a spend in a token the chain has no registry entry for', () => {
    const other = '0x9999999999999999999999999999999999999999';
    expect(policyFromPermission(permissionWith([{ allowance: '5000000', unit: 'day', token: other }]), BASE)).toEqual(
      {}
    );
  });

  it('returns an empty policy on a chain with no registry USDC', () => {
    expect(policyFromPermission(permissionWith([{ allowance: '5000000', unit: 'day' }]), 1)).toEqual({});
  });
});

describe('resolveX402Policy — grant layer', () => {
  const seeded = () => policyFromPermission(permissionWith([{ allowance: '5000000', unit: 'day' }]), BASE);

  it('seeds the per-period cap and allowlists, keeping the default per-payment cap', () => {
    const policy = resolveX402Policy(undefined, seeded());
    expect(policy.maxPerPeriod).toBe('5000000');
    expect(policy.allowedNetworks).toEqual(['eip155:8453']);
    expect(policy.maxAmountPerPayment).toBe(DEFAULT_X402_POLICY.maxAmountPerPayment);
  });

  it('leaves config untouched when there is no permission', () => {
    const policy = resolveX402Policy({ maxTotalPerSession: '50000000' });
    expect(policy.maxTotalPerSession).toBe('50000000');
  });

  // The session cap used to be pinned to the grant. That clamp only existed
  // because a per-period allowance was written into a session-wide field, and
  // it silently rewrote whatever the user configured.
  it('does not rewrite a config session cap from the per-period allowance', () => {
    const policy = resolveX402Policy({ maxTotalPerSession: '50000000' }, seeded());
    expect(policy.maxTotalPerSession).toBe('50000000');
    expect(policy.maxPerPeriod).toBe('5000000');
  });
});

describe('resolveSessionX402Policy', () => {
  const session = { chainId: BASE, permission: permissionWith([{ allowance: '5000000', unit: 'day' }]) };

  // The regression this exists to stop: `jaw x402 pay` and `jaw x402 status`
  // resolved from config alone, so they ran on the 10-USDC defaults across every
  // registry network while the MCP tool refused at the granted per-period cap.
  it('seeds from the session grant, matching what the MCP path enforces', () => {
    const policy = resolveSessionX402Policy(undefined, session);
    expect(policy.maxPerPeriod).toBe('5000000');
    expect(policy.allowedNetworks).toEqual(['eip155:8453']);
    expect(policy.maxTotalPerSession).toBeUndefined(); // the 10-USDC default gives way to the grant
  });

  it('falls back to config-only resolution when the session has no grant', () => {
    expect(resolveSessionX402Policy(undefined, undefined)).toEqual(DEFAULT_X402_POLICY);
    expect(resolveSessionX402Policy(undefined, { chainId: BASE })).toEqual(DEFAULT_X402_POLICY);
  });
});

describe('topUpCeiling', () => {
  // Preferring the per-period cap pre-funded the payer with more than the session
  // could ever spend: a 5-USDC/day grant against an explicit 1-USDC session cap
  // moved 5 USDC into the payer for a session that stops at 1.
  it('takes the smaller cap, not the per-period one', () => {
    expect(topUpCeiling({ maxPerPeriod: '5000000', maxTotalPerSession: '1000000' })).toBe(1000000n);
  });

  it('takes the per-period cap when it is the smaller one', () => {
    expect(topUpCeiling({ maxPerPeriod: '1000000', maxTotalPerSession: '5000000' })).toBe(1000000n);
  });

  it('uses whichever cap is set on its own', () => {
    expect(topUpCeiling({ maxPerPeriod: '5000000' })).toBe(5000000n);
    expect(topUpCeiling({ maxTotalPerSession: '3000000' })).toBe(3000000n);
  });

  it('is unbounded when neither cap is set, leaving the permission as the only bound', () => {
    expect(topUpCeiling({})).toBeUndefined();
  });

  // Pulling the whole cap through a permission that has 1 USDC of allowance left
  // reverts on-chain, refusing a payment whose price fit comfortably.
  it('bounds by what is left of each cap, not its full width', () => {
    expect(topUpCeiling({ maxPerPeriod: '10000000' }, { toppedUpThisPeriod: 9000000n })).toBe(1000000n);
    expect(topUpCeiling({ maxTotalPerSession: '10000000' }, { spentThisSession: 4000000n })).toBe(6000000n);
  });

  // The on-chain allowance is drawn down by the pull, the session ceiling by the
  // payment; with a float those two numbers differ by what the payer still holds.
  it('measures the period cap by top-ups and the session cap by payments', () => {
    expect(
      topUpCeiling(
        { maxPerPeriod: '10000000', maxTotalPerSession: '20000000' },
        { toppedUpThisPeriod: 5800000n, spentThisSession: 5300000n }
      )
    ).toBe(4200000n); // the permission's real remainder, not the 4.7 payments suggest
  });

  it('takes whichever of the two is tighter', () => {
    expect(
      topUpCeiling(
        { maxPerPeriod: '10000000', maxTotalPerSession: '20000000' },
        { toppedUpThisPeriod: 2000000n, spentThisSession: 19000000n }
      )
    ).toBe(1000000n);
  });

  it('floors an exhausted cap at zero rather than going negative', () => {
    expect(topUpCeiling({ maxPerPeriod: '1000000' }, { toppedUpThisPeriod: 5000000n })).toBe(0n);
  });

  // Hand-edited config must not bound the top-up by a garbage number.
  it('ignores unparseable and negative caps', () => {
    expect(topUpCeiling({ maxPerPeriod: 'abc', maxTotalPerSession: '2000000' })).toBe(2000000n);
    expect(topUpCeiling({ maxPerPeriod: '-1', maxTotalPerSession: '2000000' })).toBe(2000000n);
    expect(topUpCeiling({ maxPerPeriod: 'abc' })).toBeUndefined();
  });
});

describe('topUpFloat as a settable policy key', () => {
  it('Given topUpFloat, When validated as a config key, Then it is accepted as a scalar', () => {
    expect(isX402PolicyKey('topUpFloat')).toBe(true);
    expect((X402_SCALAR_KEYS as readonly string[]).includes('topUpFloat')).toBe(true);
  });
});

describe('per-period cap', () => {
  const policy = resolveX402Policy(
    undefined,
    policyFromPermission(permissionWith([{ allowance: '5000000', unit: 'day' }]), BASE)
  );
  const oneUsdc = { ...base, amount: '1000000' };

  it('allows spending up to the period allowance', () => {
    expect(checkPolicy(oneUsdc, policy, { spentThisPeriod: 4000000n })).toEqual({ ok: true });
  });

  it('refuses once the period allowance is used up', () => {
    const result = checkPolicy(oneUsdc, policy, { spentThisPeriod: 5000000n });
    expect(result.ok).toBe(false);
    expect(result.reason).toContain('per day');
  });

  // The blocker this design resolves: a 5 USDC/day grant with a 7-day expiry
  // permits 35 USDC on chain. Seeding the session-wide cap from one period's
  // allowance stranded the session at 5 USDC for all 7 days, with the clamp
  // silently undoing any config attempt to raise it.
  it('does not strand a multi-period grant after the first period', () => {
    // Day 3, having already spent 5 USDC on each of days 1 and 2.
    const spentAcrossSession = 10000000n;
    const result = checkPolicy(oneUsdc, policy, { spentThisSession: spentAcrossSession, spentThisPeriod: 0n });
    expect(result).toEqual({ ok: true });
  });

  it('names the window and when it resets, so the refusal is diagnosable', () => {
    const result = checkPolicy(oneUsdc, policy, {
      spentThisPeriod: 5000000n,
      periodEndsAt: new Date('2026-01-04T00:00:00.000Z'),
    });
    expect(result.reason).toContain('2026-01-04T00:00:00.000Z');
  });

  it('still enforces a session ceiling the user configured on top', () => {
    const withCeiling = resolveX402Policy(
      { maxTotalPerSession: '8000000' },
      policyFromPermission(permissionWith([{ allowance: '5000000', unit: 'day' }]), BASE)
    );
    const result = checkPolicy(oneUsdc, withCeiling, { spentThisSession: 8000000n, spentThisPeriod: 0n });
    expect(result.ok).toBe(false);
    expect(result.reason).toContain('maxTotalPerSession');
  });

  it('reports the granted period cap ahead of the session cap when both would refuse', () => {
    const withCeiling = resolveX402Policy(
      { maxTotalPerSession: '8000000' },
      policyFromPermission(permissionWith([{ allowance: '5000000', unit: 'day' }]), BASE)
    );
    const result = checkPolicy(oneUsdc, withCeiling, { spentThisSession: 8000000n, spentThisPeriod: 5000000n });
    expect(result.reason).toContain('per day');
  });
});
