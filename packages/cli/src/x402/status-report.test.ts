import { describe, it, expect } from 'vitest';
import { formatUsdc, formatRemaining, diagnose, type StatusFacts } from './status-report.js';

describe('formatUsdc', () => {
  it('scales base units and trims trailing zeros', () => {
    expect(formatUsdc('10000000', 6)).toBe('10 USDC');
    expect(formatUsdc('2500000', 6)).toBe('2.5 USDC');
    expect(formatUsdc('1000', 6)).toBe('0.001 USDC');
    expect(formatUsdc('0', 6)).toBe('0 USDC');
  });

  it('reads an absent cap as unlimited rather than zero', () => {
    expect(formatUsdc(undefined, 6)).toBe('unlimited');
  });

  it('surfaces a malformed cap instead of rendering a wrong number', () => {
    expect(formatUsdc('not-a-number', 6)).toBe('not-a-number (invalid)');
  });
});

describe('formatRemaining', () => {
  it('counts whole days, falling back to hours under a day', () => {
    expect(formatRemaining(4 * 86400)).toBe('4 days left');
    expect(formatRemaining(86400)).toBe('1 day left');
    expect(formatRemaining(5 * 3600)).toBe('5h left');
    expect(formatRemaining(-10)).toBe('0h left');
  });
});

describe('diagnose', () => {
  const healthy: StatusFacts = {
    expired: false,
    ownerAddress: '0xOwner',
    ownerBalance: '12.5',
    payerBalance: '0',
    hasAsset: true,
    spent: 3_000_000n,
    sessionCap: 10_000_000n,
  };

  it('says nothing when the setup is fine', () => {
    expect(diagnose(healthy)).toEqual([]);
  });

  it('flags an expired session first', () => {
    expect(diagnose({ ...healthy, expired: true })[0]).toMatch(/session expired/i);
  });

  // The case worth having this command for: payments succeed, so nothing looks
  // wrong, but they spend the payer's own balance and never touch the permission.
  it('catches a funded payer next to an empty owner', () => {
    const problems = diagnose({ ...healthy, ownerBalance: '0', payerBalance: '16.98' });
    expect(problems).toHaveLength(1);
    expect(problems[0]).toMatch(/bypass the permission/);
    expect(problems[0]).toMatch(/Move the funds to the owner/);
  });

  it('says there is nothing to pay with when both are empty', () => {
    const problems = diagnose({ ...healthy, ownerBalance: '0', payerBalance: '0' });
    expect(problems[0]).toMatch(/nothing to pay with/);
    expect(problems[0]).not.toMatch(/bypass/);
  });

  it('blames the connection only when both balance reads failed', () => {
    expect(diagnose({ ...healthy, ownerBalance: null, payerBalance: null })[0]).toMatch(/Check the API key/);
  });

  it('points at the address when only the owner read failed', () => {
    const problems = diagnose({ ...healthy, ownerBalance: null, payerBalance: '1' });
    expect(problems[0]).toMatch(/0xOwner/);
    expect(problems[0]).not.toMatch(/Check the API key/);
  });

  it('reports a used-up session cap with the way out', () => {
    const problems = diagnose({ ...healthy, spent: 10_000_000n });
    expect(problems[0]).toMatch(/cap is used up/);
    expect(problems[0]).toMatch(/jaw config set x402.maxTotalPerSession/);
  });

  it('treats spending past the cap the same as reaching it', () => {
    expect(diagnose({ ...healthy, spent: 99_000_000n })).toHaveLength(1);
  });

  it('does not fire the cap warning when there is no cap', () => {
    expect(diagnose({ ...healthy, spent: 99_000_000n, sessionCap: null })).toEqual([]);
  });

  it('flags a chain with no USDC and skips the balance complaint', () => {
    const problems = diagnose({ ...healthy, hasAsset: false, ownerBalance: null, payerBalance: null });
    expect(problems).toHaveLength(1);
    expect(problems[0]).toMatch(/no USDC configured/);
  });

  it('lists every problem when several hold at once', () => {
    const problems = diagnose({ ...healthy, expired: true, ownerBalance: '0', payerBalance: '0', spent: 10_000_000n });
    expect(problems).toHaveLength(3);
    expect(problems[0]).toMatch(/session expired/i);
  });
});

// `ready` in the JSON output is derived from this list, so an empty result has
// to mean the same thing the human output means when it prints no warnings.
describe('diagnose as a readiness verdict', () => {
  const healthy = {
    expired: false,
    ownerAddress: '0xOwner',
    ownerBalance: '12.5',
    payerBalance: '0',
    hasAsset: true,
    spent: 3_000_000n,
    sessionCap: 10_000_000n,
  };

  it('is empty exactly when the setup is usable', () => {
    expect(diagnose(healthy)).toHaveLength(0);
  });

  it('is non-empty for a setup that pays but bypasses the permission', () => {
    // The case that used to report ready:true while warning in the same breath.
    expect(diagnose({ ...healthy, ownerBalance: '0', payerBalance: '16.98' }).length).toBeGreaterThan(0);
  });
});
