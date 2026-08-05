import { describe, it, expect } from 'vitest';
import {
  checkPolicy,
  resolveX402Policy,
  policyFromGrant,
  DEFAULT_X402_POLICY,
  isX402PolicyKey,
  X402_SCALAR_KEYS,
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

  it('lets an explicit config value win over the grant (tighten only)', () => {
    const policy = resolveX402Policy({ maxTotalPerSession: '1000000' }, policyFromGrant(grant));
    expect(policy.maxTotalPerSession).toBe('1000000'); // config beats the grant seed
    expect(policy.allowedNetworks).toEqual(['eip155:8453']); // grant seed still applies where config is silent
  });
});
describe('topUpFloat as a settable policy key', () => {
  it('Given topUpFloat, When validated as a config key, Then it is accepted as a scalar', () => {
    expect(isX402PolicyKey('topUpFloat')).toBe(true);
    expect((X402_SCALAR_KEYS as readonly string[]).includes('topUpFloat')).toBe(true);
  });
});
