import { describe, expect, it, vi } from 'vitest';

// format.ts imports JAW_RPC_URL + SUPPORTED_CHAINS from @jaw.id/core, but only to build
// the on-chain resolver / native-coin helpers we never invoke here (the tests inject
// `resolveToken` via ctx). Stub the module so the suite stays hermetic and doesn't pull
// core's source graph under the node test env.
vi.mock('@jaw.id/core', () => ({ JAW_RPC_URL: {}, SUPPORTED_CHAINS: [] }));

import { applyFormat } from './format';

/* eslint-disable @typescript-eslint/no-explicit-any */

const USDC = '0x0b2C639c533813f4Aa9D7837CAf62653d097Ff85';

// A permit-style tokenAmount field: `tokenPath: "@.to"` is a calldata idiom that never
// resolves in a typed-data envelope (which carries verifyingContract, not `to`), so it
// exercises the verifyingContract fallback.
const amountField = { path: 'value', label: 'Amount', format: 'tokenAmount', params: { tokenPath: '@.to' } };

const baseCtx = () => ({
  args: { value: '1000000' },
  tx: { verifyingContract: USDC },
  chainId: 10,
  resolveToken: async (address: string) => ({ address, decimals: 6, symbol: 'USDC' }),
});

describe('applyFormat — verifyingContract token fallback (P2#7 opt-in gate)', () => {
  it('denominates against the verifyingContract when the descriptor opts in via metadata.token', async () => {
    const descriptor = { context: {}, metadata: { token: { ticker: 'USDC', decimals: 6 } } } as any;
    const format = { fields: [amountField] } as any;

    const out = await applyFormat(descriptor, format, baseCtx() as any);
    if (!out) throw new Error('expected a clear-signing display');
    const row = out.rows[0];
    expect(row.kind).toBe('tokenAmount');
    expect(row.value).toBe('1'); // 1_000_000 / 1e6
    expect(row.symbol).toBe('USDC');
    expect(row.tokenAddress).toBe(USDC);
  });

  it('renders raw and never reads a token when the descriptor omits metadata.token', async () => {
    const descriptor = { context: {}, metadata: { owner: 'USD Coin' } } as any;
    const format = { fields: [amountField] } as any;
    const resolveToken = vi.fn(async (address: string) => ({ address, decimals: 6, symbol: 'USDC' }));

    const out = await applyFormat(descriptor, format, { ...baseCtx(), resolveToken } as any);
    if (!out) throw new Error('expected a clear-signing display');
    const row = out.rows[0];
    expect(row.kind).toBe('raw');
    expect(row.value).toBe('1000000');
    expect(row.symbol).toBeUndefined();
    // The gate short-circuits before any on-chain read — a non-token verifyingContract
    // that happens to implement decimals()/symbol() can't get a convincing-but-wrong unit.
    expect(resolveToken).not.toHaveBeenCalled();
  });
});

describe('applyFormat — MappingFailure', () => {
  it('renders a scalar field into a row (positive: no failure)', async () => {
    const descriptor = { context: {} } as any;
    const format = { fields: [{ path: 'nonce', label: 'Nonce' }] } as any;
    const ctx = { args: { nonce: '7' }, tx: {}, chainId: 1 } as any;

    const out = await applyFormat(descriptor, format, ctx);
    if (!out) throw new Error('expected a clear-signing display');
    expect(out.rows).toHaveLength(1);
    expect(out.rows[0].value).toBe('7');
  });

  it('aborts the whole descriptor (returns null) when a field maps to a non-scalar struct', async () => {
    const descriptor = { context: {} } as any;
    const format = { fields: [{ path: 'details', label: 'Details' }] } as any;
    // `details` is a struct (à la Permit2 PermitDetails) — a flat row can't honestly hold
    // it, so the descriptor is abandoned in favour of the raw tree.
    const ctx = { args: { details: { token: USDC, amount: '1' } }, tx: {}, chainId: 1 } as any;

    const out = await applyFormat(descriptor, format, ctx);
    expect(out).toBeNull();
  });
});
