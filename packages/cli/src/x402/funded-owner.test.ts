import { describe, it, expect } from 'vitest';
import { whyOwnerCannotFundSession } from './funded-owner.js';

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

  // The wallet makes the same check with the money in front of it and skips the
  // transfer, which costs a sponsored first operation rather than the session.
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
