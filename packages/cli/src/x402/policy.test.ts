import { describe, it, expect } from 'vitest';
import {
  checkPolicy,
  resolveX402Policy,
  policyFromGrant,
  extractGrantedSpend,
  DEFAULT_X402_POLICY,
  isX402PolicyKey,
  X402_SCALAR_KEYS,
  resolveSessionX402Policy,
  topUpCeiling,
} from './policy.js';
import { USDC_BY_NETWORK } from './asset-registry.js';
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

  it('allows the two schemes this client can produce a payment for', () => {
    expect(checkPolicy(base, {}).ok).toBe(true);
    expect(checkPolicy({ ...base, scheme: 'upto' }, {}).ok).toBe(true);
  });

  it('rejects a scheme it cannot sign', () => {
    // Off the wire the scheme is a plain string, so this is a runtime check.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect(checkPolicy({ ...base, scheme: 'permit2-batch' as any }, {}).ok).toBe(false);
  });

  /**
   * Under `upto` the number the caps measure is a ceiling, not a price, and a
   * refusal that read like a price would look broken to anyone paying a service
   * that charges a fraction of it.
   */
  it('names the ceiling as a ceiling when it refuses one', () => {
    const verdict = checkPolicy({ ...base, scheme: 'upto', amount: '5000000' }, { maxAmountPerPayment: '1000000' });
    expect(verdict.ok).toBe(false);
    expect(verdict.reason).toContain('up to 5000000');
  });

  /**
   * The settlement proxy is only deployed on two of the four chains the asset
   * registry carries, and the check used to live in the signer, downstream of
   * the top-up. Refusing here means the option is skipped during selection: a
   * dry run tells the truth, and nothing has been spent when it does.
   */
  it('refuses an upto option on a chain the settlement proxy was never verified on', () => {
    const polygon = { ...base, scheme: 'upto' as const, network: 'eip155:137', asset: USDC_BY_NETWORK['eip155:137'].address };
    const verdict = checkPolicy(polygon, {});
    expect(verdict.ok).toBe(false);
    expect(verdict.reason).toContain('is not available on eip155:137');
    // The same challenge under `exact` still pays: the refusal is about where
    // the proxy exists, not about the chain.
    expect(checkPolicy({ ...polygon, scheme: 'exact' }, {}).ok).toBe(true);
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

describe('policyFromGrant', () => {
  const grant = { token: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913', allowance: '5000000', network: 'eip155:8453' };

  it('returns an empty policy when there is no grant', () => {
    expect(policyFromGrant(undefined)).toEqual({});
  });

  it('seeds the session cap and allowlists from the granted spend', () => {
    expect(policyFromGrant(grant)).toEqual({
      maxTotalPerSession: '5000000',
      allowedAssets: ['0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913'],
      allowedNetworks: ['eip155:8453'],
    });
  });
});

describe('resolveX402Policy — grant layer', () => {
  const grant = { token: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913', allowance: '5000000', network: 'eip155:8453' };

  it('seeds the session cap and allowlists from the grant, keeping the default per-payment cap', () => {
    const policy = resolveX402Policy(undefined, policyFromGrant(grant));
    expect(policy.maxTotalPerSession).toBe('5000000'); // from the grant, not the 10 USDC default
    expect(policy.allowedNetworks).toEqual(['eip155:8453']); // narrowed to the granted chain
    expect(policy.maxAmountPerPayment).toBe(DEFAULT_X402_POLICY.maxAmountPerPayment); // default still applies
  });

  it('lets config tighten the session cap below the grant', () => {
    const policy = resolveX402Policy({ maxTotalPerSession: '1000000' }, policyFromGrant(grant)); // 1 < 5 USDC
    expect(policy.maxTotalPerSession).toBe('1000000'); // config tightens
    expect(policy.allowedNetworks).toEqual(['eip155:8453']); // grant seed still applies where config is silent
  });

  it('leaves config untouched when there is no grant', () => {
    const policy = resolveX402Policy({ maxTotalPerSession: '50000000' });
    expect(policy.maxTotalPerSession).toBe('50000000');
  });

  // The session cap used to be pinned to the grant. That clamp only existed
  // because a per-period allowance was being written into a session-wide field,
  // and it silently rewrote whatever the user configured. With the allowance on
  // maxPerPeriod the two caps measure different things, so config owns this one.
  it('no longer rewrites a config session cap above the granted per-period allowance', () => {
    const periodGrant = { ...grant, unit: 'day' as const, multiplier: 1, periodAnchor: '2026-01-01T00:00:00.000Z' };
    const policy = resolveX402Policy({ maxTotalPerSession: '50000000' }, policyFromGrant(periodGrant));
    expect(policy.maxTotalPerSession).toBe('50000000'); // honoured, not clamped to 5000000
    expect(policy.maxPerPeriod).toBe('5000000'); // the grant still constrains each period
  });
});

describe('resolveSessionX402Policy', () => {
  const grantedSpend = {
    token: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
    allowance: '5000000',
    network: 'eip155:8453',
    unit: 'day' as const,
    multiplier: 1,
    periodAnchor: '2026-01-01T00:00:00.000Z',
  };

  // The regression this exists to stop: `jaw x402 pay` and `jaw x402 status`
  // resolved from config alone, so they ran on the 10-USDC defaults across every
  // registry network while the MCP tool refused at the granted per-period cap.
  it('seeds from the session grant, matching what the MCP path enforces', () => {
    const policy = resolveSessionX402Policy(undefined, { grantedSpend });
    expect(policy.maxPerPeriod).toBe('5000000');
    expect(policy.allowedNetworks).toEqual(['eip155:8453']);
    expect(policy.maxTotalPerSession).toBeUndefined(); // the 10-USDC default gives way to the grant
  });

  it('falls back to config-only resolution when the session has no grant', () => {
    expect(resolveSessionX402Policy(undefined, undefined)).toEqual(DEFAULT_X402_POLICY);
    expect(resolveSessionX402Policy(undefined, {})).toEqual(DEFAULT_X402_POLICY);
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

describe('policyFromGrant — period-aware grants', () => {
  const base = { token: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913', allowance: '5000000', network: 'eip155:8453' };

  it('puts a per-period allowance on maxPerPeriod, never on the session total', () => {
    const policy = policyFromGrant({ ...base, unit: 'day', multiplier: 1, periodAnchor: '2026-01-01T00:00:00.000Z' });
    expect(policy.maxPerPeriod).toBe('5000000');
    expect(policy.period).toEqual({ unit: 'day', multiplier: 1, anchor: '2026-01-01T00:00:00.000Z' });
    // Seeding this would cap a 7-day session at one day's allowance for its whole life.
    expect(policy.maxTotalPerSession).toBeUndefined();
  });

  it('falls back to a session-wide cap when the grant records no period', () => {
    // Session configs written before the period was persisted: the allowance was
    // already being read as session-wide, so keep meaning that.
    const policy = policyFromGrant(base);
    expect(policy.maxTotalPerSession).toBe('5000000');
    expect(policy.maxPerPeriod).toBeUndefined();
  });
});

describe('extractGrantedSpend', () => {
  const USDC_BASE = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913';

  it('pulls the USDC spend for the session chain, hex allowance to base units', () => {
    const spends = [{ token: USDC_BASE.toLowerCase(), allowance: '0x4c4b40' }]; // 5_000_000
    expect(extractGrantedSpend(spends, 8453)).toEqual({
      token: USDC_BASE, // canonical registry form, not the lowercased input
      allowance: '5000000',
      network: 'eip155:8453',
    });
  });

  it('returns undefined when there is no spends array', () => {
    expect(extractGrantedSpend(undefined, 8453)).toBeUndefined();
  });

  it('returns undefined when no spend matches the registry USDC', () => {
    const spends = [{ token: '0x000000000000000000000000000000000000dEaD', allowance: '0x1' }];
    expect(extractGrantedSpend(spends, 8453)).toBeUndefined();
  });

  it('returns undefined for a chain with no registry USDC', () => {
    const spends = [{ token: USDC_BASE, allowance: '0x1' }];
    expect(extractGrantedSpend(spends, 1)).toBeUndefined();
  });

  it('returns undefined for a malformed hex allowance rather than a bad cap', () => {
    const spends = [{ token: USDC_BASE, allowance: 'not-hex' }];
    expect(extractGrantedSpend(spends, 8453)).toBeUndefined();
  });

  it('keeps a zero allowance (base units 0), which blocks all payments', () => {
    const spends = [{ token: USDC_BASE, allowance: '0x0' }];
    expect(extractGrantedSpend(spends, 8453)?.allowance).toBe('0');
  });

  it('returns undefined for a negative allowance rather than seeding a negative cap', () => {
    const spends = [{ token: USDC_BASE, allowance: '-0x100' }];
    expect(extractGrantedSpend(spends, 8453)).toBeUndefined();
  });
});

describe('topUpFloat as a settable policy key', () => {
  it('Given topUpFloat, When validated as a config key, Then it is accepted as a scalar', () => {
    expect(isX402PolicyKey('topUpFloat')).toBe(true);
    expect((X402_SCALAR_KEYS as readonly string[]).includes('topUpFloat')).toBe(true);
  });
});

describe('per-period cap', () => {
  const grant = {
    token: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
    allowance: '5000000', // 5 USDC
    network: 'eip155:8453',
    unit: 'day' as const,
    multiplier: 1,
    periodAnchor: '2026-01-01T00:00:00.000Z',
  };
  const policy = resolveX402Policy(undefined, policyFromGrant(grant));
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
    const withCeiling = resolveX402Policy({ maxTotalPerSession: '8000000' }, policyFromGrant(grant));
    const result = checkPolicy(oneUsdc, withCeiling, { spentThisSession: 8000000n, spentThisPeriod: 0n });
    expect(result.ok).toBe(false);
    expect(result.reason).toContain('maxTotalPerSession');
  });

  it('reports the granted period cap ahead of the session cap when both would refuse', () => {
    const withCeiling = resolveX402Policy({ maxTotalPerSession: '8000000' }, policyFromGrant(grant));
    const result = checkPolicy(oneUsdc, withCeiling, { spentThisSession: 8000000n, spentThisPeriod: 5000000n });
    expect(result.reason).toContain('per day');
  });
});

describe('extractGrantedSpend — period capture', () => {
  const USDC_BASE = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913';
  const anchor = new Date('2026-01-01T00:00:00.000Z');

  it('carries the unit and multiplier so the allowance keeps its dimension', () => {
    const grant = extractGrantedSpend(
      [{ token: USDC_BASE, allowance: '0x4C4B40', unit: 'day', multiplier: 1 }],
      8453,
      anchor
    );
    expect(grant).toMatchObject({ allowance: '5000000', unit: 'day', multiplier: 1 });
    expect(grant?.periodAnchor).toBe('2026-01-01T00:00:00.000Z');
  });

  it('defaults a missing multiplier to 1', () => {
    const grant = extractGrantedSpend([{ token: USDC_BASE, allowance: '0x4C4B40', unit: 'week' }], 8453, anchor);
    expect(grant?.multiplier).toBe(1);
  });

  // The contract has no Year unit; the SDK rewrites 'year' to month x12 before
  // encoding, so the local window has to be the same one the permission enforces.
  it('normalises year to twelve months, as the SDK does before encoding', () => {
    const grant = extractGrantedSpend([{ token: USDC_BASE, allowance: '0x4C4B40', unit: 'year' }], 8453, anchor);
    expect(grant).toMatchObject({ unit: 'month', multiplier: 12 });
  });

  it('scales a multi-year multiplier the same way', () => {
    const grant = extractGrantedSpend(
      [{ token: USDC_BASE, allowance: '0x4C4B40', unit: 'year', multiplier: 2 }],
      8453,
      anchor
    );
    expect(grant).toMatchObject({ unit: 'month', multiplier: 24 });
  });

  it('records no period for a unit with no meaning at all', () => {
    const grant = extractGrantedSpend([{ token: USDC_BASE, allowance: '0x4C4B40', unit: 'decade' }], 8453, anchor);
    expect(grant?.allowance).toBe('5000000');
    expect(grant?.unit).toBeUndefined();
    expect(grant?.periodAnchor).toBeUndefined();
  });

  it('records no period when the grant omits the unit entirely', () => {
    const grant = extractGrantedSpend([{ token: USDC_BASE, allowance: '0x4C4B40' }], 8453, anchor);
    expect(grant?.unit).toBeUndefined();
  });
});
