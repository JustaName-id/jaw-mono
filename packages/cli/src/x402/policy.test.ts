import { describe, it, expect } from 'vitest';
import { checkPolicy, resolveX402Policy, DEFAULT_X402_POLICY } from './policy.js';
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
});
