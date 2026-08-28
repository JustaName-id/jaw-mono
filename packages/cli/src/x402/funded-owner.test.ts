import { describe, it, expect } from 'vitest';
import { whyOwnerCannotFundSession, whySpenderCannotPay } from './funded-owner.js';

const OWNER = '0x1111111111111111111111111111111111111111';
const BASE_SEPOLIA = 84532;
const PREFUND = 100_000n; // 0.10 USDC

function bridge(accounts: string[] | undefined) {
  return async (method: string) => (method === 'eth_requestAccounts' ? accounts : undefined);
}

describe('whyOwnerCannotFundSession', () => {
  it('lets a funded account through', async () => {
    const reason = await whyOwnerCannotFundSession({
      chainId: BASE_SEPOLIA,
      request: bridge([OWNER]),
      readBalance: async () => PREFUND,
    });

    expect(reason).toBeNull();
  });

  // Granting anyway leaves a permission that cannot be used until the account is
  // funded and the whole setup is run again, which revokes and re-grants.
  it('stops a short account, naming what it holds and what it needs', async () => {
    const reason = await whyOwnerCannotFundSession({
      chainId: BASE_SEPOLIA,
      request: bridge([OWNER]),
      readBalance: async () => PREFUND - 1n,
    });

    expect(reason).toContain(OWNER);
    expect(reason).toContain('0.099999 USDC');
    expect(reason).toContain('0.1 USDC');
  });

  // The wallet makes the same check against its own node before building the
  // transfer, so an RPC hiccup here costs a clearer error, not the guarantee.
  it('does not refuse over an unreachable RPC', async () => {
    const reason = await whyOwnerCannotFundSession({
      chainId: BASE_SEPOLIA,
      request: bridge([OWNER]),
      readBalance: async () => {
        throw new Error('rpc down');
      },
    });

    expect(reason).toBeNull();
  });

  it('says nothing on a chain with no USDC to fund', async () => {
    const reason = await whyOwnerCannotFundSession({
      chainId: 1,
      request: bridge([OWNER]),
      readBalance: async () => 0n,
    });

    expect(reason).toBeNull();
  });

  it('says nothing when the browser reports no account', async () => {
    const reason = await whyOwnerCannotFundSession({
      chainId: BASE_SEPOLIA,
      request: bridge([]),
      readBalance: async () => 0n,
    });

    expect(reason).toBeNull();
  });
});

const SPENDER = '0x2222222222222222222222222222222222222222';

/**
 * The wallet decides whether to honour `capabilities.prefundSpender`, and one
 * that does not implement it drops the request without a word. Setup then looks
 * like it worked and the first payment fails on something that reads like a
 * paymaster problem, so the gap is caught here instead.
 */
describe('whySpenderCannotPay', () => {
  const check = (readBalance: () => Promise<bigint>) =>
    whySpenderCannotPay({ chainId: BASE_SEPOLIA, spender: SPENDER, readBalance });

  it('says nothing when the wallet seeded the session', async () => {
    expect(await check(async () => PREFUND)).toBeNull();
  });

  it('accepts any amount above zero, since the wallet prices the seed itself', async () => {
    expect(await check(async () => 1n)).toBeNull();
  });

  it('names the address and the amount when nothing arrived', async () => {
    const reason = await check(async () => 0n);
    expect(reason).toContain(SPENDER);
    expect(reason).toContain('0.1');
    expect(reason).toContain('84532');
  });

  it('stays quiet on a chain with no USDC, where gas is not charged in it', async () => {
    expect(await whySpenderCannotPay({ chainId: 1, spender: SPENDER, readBalance: async () => 0n })).toBeNull();
  });

  it('stays quiet when the node cannot be read, since the session is already saved', async () => {
    const reason = await check(async () => {
      throw new Error('rpc down');
    });
    expect(reason).toBeNull();
  });
});
