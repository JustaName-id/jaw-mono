import { describe, expect, test, vi } from 'vitest';
import { decodeFunctionData, erc20Abi } from 'viem';
import { ensurePayerFunds, type TopUpExecutor } from './topup.js';
import type { X402PaymentRequirement } from './types.js';

const PAYER = '0x1111111111111111111111111111111111111111' as const;
const BASE_SEPOLIA_USDC = '0x036CbD53842c5426634e7929541eC2318f3dCF7e';

const requirement = (amount = '1000000'): X402PaymentRequirement =>
  ({
    scheme: 'exact',
    network: 'eip155:84532',
    amount,
    asset: BASE_SEPOLIA_USDC,
    payTo: '0x2222222222222222222222222222222222222222',
    maxTimeoutSeconds: 60,
  }) as X402PaymentRequirement;

function fakeExecutor(overrides?: {
  sendCalls?: (params: unknown) => Promise<unknown>;
  status?: () => Promise<unknown>;
}): { executor: TopUpExecutor; requests: Array<{ method: string; params: unknown }> } {
  const requests: Array<{ method: string; params: unknown }> = [];
  const executor: TopUpExecutor = {
    async request(method, params) {
      requests.push({ method, params });
      if (method === 'wallet_sendCalls') {
        // Real bridge shape: Account.sendCalls resolves to { id, chainId }.
        return overrides?.sendCalls ? overrides.sendCalls(params) : { id: '0xbatch1', chainId: 84532 };
      }
      if (method === 'wallet_getCallsStatus') {
        return overrides?.status ? overrides.status() : { status: 200 };
      }
      throw new Error(`unexpected method ${method}`);
    },
  };
  return { executor, requests };
}

const instantly = { pollMs: 0, sleep: async () => undefined };

describe('ensurePayerFunds', () => {
  test('Given the payer balance covers the price, When ensuring funds, Then nothing runs on-chain', async () => {
    const { executor, requests } = fakeExecutor();

    const out = await ensurePayerFunds(requirement('1000000'), PAYER, executor, {
      balanceReader: async () => 2_000_000n,
      ...instantly,
    });

    expect(out).toEqual({ ok: true, skipped: true });
    expect(requests).toHaveLength(0);
  });

  test('Given a shortfall, When ensuring funds, Then a permitted transfer for the shortfall plus the gas reserve runs and confirms', async () => {
    const { executor, requests } = fakeExecutor();

    const out = await ensurePayerFunds(requirement('1000000'), PAYER, executor, {
      balanceReader: async () => 250_000n,
      ...instantly,
    });

    expect(out.ok).toBe(true);
    expect(out.amount).toBe('850000'); // 0.75 short + 0.10 reserve
    expect(out.batchId).toBe('0xbatch1');

    const send = requests.find((r) => r.method === 'wallet_sendCalls');
    const call = (send?.params as Array<{ calls: Array<{ to: string; data: `0x${string}` }> }>)[0].calls[0];
    expect(call.to.toLowerCase()).toBe(BASE_SEPOLIA_USDC.toLowerCase());
    const decoded = decodeFunctionData({ abi: erc20Abi, data: call.data });
    expect(decoded.functionName).toBe('transfer');
    expect(decoded.args).toEqual([PAYER, 850_000n]);
  });

  // The payer sends the top-up userOp itself, so the ERC-20 paymaster charges it
  // right after the transfer lands. Pulling only the shortfall would leave the
  // fee to come out of the payment, and the payment would land short.
  test('Given a refill, When it lands, Then the reserve is left behind so the next one can pay its own fee', async () => {
    const { executor, requests } = fakeExecutor();

    const out = await ensurePayerFunds(requirement('1000000'), PAYER, executor, {
      balanceReader: async () => 1_000_000n - 1n, // one base unit short
      ...instantly,
    });

    expect(out.amount).toBe('100001');

    const send = requests.find((r) => r.method === 'wallet_sendCalls');
    const call = (send?.params as Array<{ calls: Array<{ to: string; data: `0x${string}` }> }>)[0].calls[0];
    const decoded = decodeFunctionData({ abi: erc20Abi, data: call.data });
    expect(decoded.args).toEqual([PAYER, 100_001n]);
  });

  test('Given a float target above the price, When topping up, Then the refill reaches the float (fewer hops later)', async () => {
    const { executor } = fakeExecutor();

    const out = await ensurePayerFunds(requirement('1000000'), PAYER, executor, {
      balanceReader: async () => 0n,
      floatTarget: 5_000_000n,
      ...instantly,
    });

    expect(out.ok).toBe(true);
    expect(out.amount).toBe('5100000'); // the float, plus the reserve
  });

  test('Given a float target above the session cap, When topping up, Then the refill is clamped to the session cap (blast-radius bound)', async () => {
    const { executor } = fakeExecutor();

    const out = await ensurePayerFunds(requirement('1000000'), PAYER, executor, {
      balanceReader: async () => 0n,
      floatTarget: 100_000_000n, // 100 USDC float requested
      maxTopUp: 10_000_000n, // but the session can only ever spend 10 USDC
      ...instantly,
    });

    expect(out.ok).toBe(true);
    expect(out.amount).toBe('10000000'); // clamped to the session cap, not the float
  });

  test('Given a period nearly exhausted, When the shortfall exceeds what the caps have left, Then it refuses before anything moves', async () => {
    const { executor, requests } = fakeExecutor();

    const out = await ensurePayerFunds(requirement('5000000'), PAYER, executor, {
      balanceReader: async () => 0n,
      maxTopUp: 1_000_000n, // only 1 USDC left of the granted period
      ...instantly,
    });

    // Pulling the 1 USDC that fits buys a payer that still cannot pay the 5,
    // and the period cap has been spent on it. The cap mirrors the on-chain
    // allowance, so the transfer for the full shortfall would revert anyway.
    expect(out.ok).toBe(false);
    expect(out.reason).toContain('1000000 base units left');
    expect(requests).toHaveLength(0);
  });

  test('Given a cap that covers the shortfall but not the fee on top of it, When topping up, Then it refuses rather than funding a payment that cannot be signed', async () => {
    const { executor, requests } = fakeExecutor();

    // 2 USDC price against 2 USDC of cap: the transfer lands, the paymaster
    // charges the payer for it, and the payment is signed for more than the
    // payer now holds.
    const out = await ensurePayerFunds(requirement('2000000'), PAYER, executor, {
      balanceReader: async () => 0n,
      maxTopUp: 2_000_000n,
      ...instantly,
    });

    expect(out.ok).toBe(false);
    expect(out.reason).toContain('2010000 topped up');
    expect(requests).toHaveLength(0);
  });

  test('Given a cap that clears the shortfall by one operation, When topping up, Then the refill runs clamped to the cap', async () => {
    const { executor } = fakeExecutor();

    const out = await ensurePayerFunds(requirement('2000000'), PAYER, executor, {
      balanceReader: async () => 0n,
      maxTopUp: 2_010_000n, // the price plus exactly one operation's fee
      ...instantly,
    });

    // The reserve is what the clamp cuts: the payment and its fee are covered,
    // the float behind them is not, and that is the right thing to give up.
    expect(out.ok).toBe(true);
    expect(out.amount).toBe('2010000');
  });

  test('Given the on-chain cap rejects the transfer, When topping up, Then it refuses with the on-chain reason and no payment proceeds', async () => {
    const { executor } = fakeExecutor({
      sendCalls: async () => {
        throw new Error('execution reverted: spend limit exceeded');
      },
    });

    const out = await ensurePayerFunds(requirement('1000000'), PAYER, executor, {
      balanceReader: async () => 0n,
      ...instantly,
    });

    expect(out.ok).toBe(false);
    expect(out.reason).toContain('top-up refused on-chain');
    expect(out.reason).toContain('spend limit exceeded');
  });

  test('Given the transaction fails after broadcast, When polling, Then it reports the cap/revoked explanation', async () => {
    const { executor } = fakeExecutor({ status: async () => ({ status: 500 }) });

    const out = await ensurePayerFunds(requirement('1000000'), PAYER, executor, {
      balanceReader: async () => 0n,
      ...instantly,
    });

    expect(out.ok).toBe(false);
    expect(out.reason).toContain('spending cap reached, or permission expired/revoked');
    expect(out.batchId).toBe('0xbatch1');
  });

  test('Given confirmation never arrives, When the timeout passes, Then it gives up with the batch id for reconciliation', async () => {
    const { executor } = fakeExecutor({ status: async () => ({ status: 100 }) });
    let t = 0;

    const out = await ensurePayerFunds(requirement('1000000'), PAYER, executor, {
      balanceReader: async () => 0n,
      now: () => (t += 60_000),
      timeoutMs: 90_000,
      ...instantly,
    });

    expect(out.ok).toBe(false);
    expect(out.reason).toContain('not confirmed after');
    expect(out.batchId).toBe('0xbatch1');
  });

  test('Given the status read wins the deadline race, When it returns, Then no timer is left armed to hold the process open', async () => {
    // Promise.race settles but never cancels the loser. An armed deadline timer
    // outlives the top-up and keeps the event loop alive, so `jaw x402 pay`
    // would print `Paid.` and then sit there for the rest of the timeout.
    vi.useFakeTimers();
    try {
      const { executor } = fakeExecutor();

      // No injected sleep here on purpose: the leaked timer is the real one the
      // default sleep arms, so injecting an instant sleep would test nothing.
      const out = await ensurePayerFunds(requirement('1000000'), PAYER, executor, {
        balanceReader: async () => 0n,
        timeoutMs: 90_000,
      });

      expect(out.ok).toBe(true);
      expect(vi.getTimerCount()).toBe(0);
    } finally {
      vi.useRealTimers();
    }
  });

  test('Given a bridge that returns a bare string id, When topping up, Then it still confirms (shape tolerance)', async () => {
    const { executor } = fakeExecutor({ sendCalls: async () => '0xbatch2' });

    const out = await ensurePayerFunds(requirement('1000000'), PAYER, executor, {
      balanceReader: async () => 0n,
      ...instantly,
    });

    expect(out.ok).toBe(true);
    expect(out.batchId).toBe('0xbatch2');
  });

  test('Given a bridge that returns no call id, When topping up, Then it refuses because the transfer cannot be confirmed', async () => {
    const { executor } = fakeExecutor({ sendCalls: async () => ({ chainId: 84532 }) });

    const out = await ensurePayerFunds(requirement('1000000'), PAYER, executor, {
      balanceReader: async () => 0n,
      ...instantly,
    });

    expect(out.ok).toBe(false);
    expect(out.reason).toContain('no call id');
  });

  test('Given the payment network differs from the session chain, When ensuring funds, Then it refuses instead of transferring on the wrong chain', async () => {
    const { executor, requests } = fakeExecutor();

    const out = await ensurePayerFunds(requirement('1000000'), PAYER, executor, {
      balanceReader: async () => 0n,
      sessionChainId: 8453,
      ...instantly,
    });

    expect(out.ok).toBe(false);
    expect(out.reason).toContain('session is on chain 8453');
    expect(out.reason).toContain('needs chain 84532');
    expect(requests).toHaveLength(0);
  });

  test('Given a requirement for a non-USDC asset, When ensuring funds, Then it defers to scheme validation instead of funding the wrong token', async () => {
    const { executor, requests } = fakeExecutor();

    const out = await ensurePayerFunds(
      { ...requirement(), asset: '0x9999999999999999999999999999999999999999' } as X402PaymentRequirement,
      PAYER,
      executor,
      { balanceReader: async () => 0n, ...instantly }
    );

    expect(out).toEqual({ ok: true, skipped: true });
    expect(requests).toHaveLength(0);
  });

  test('Given an unsupported network, When ensuring funds, Then it defers to the scheme validation (no-op)', async () => {
    const { executor, requests } = fakeExecutor();

    const out = await ensurePayerFunds(
      { ...requirement(), network: 'eip155:999999' } as X402PaymentRequirement,
      PAYER,
      executor,
      instantly
    );

    expect(out).toEqual({ ok: true, skipped: true });
    expect(requests).toHaveLength(0);
  });
});

describe('ensurePayerFunds, statuses the bridge can actually return', () => {
  it('keeps polling when the call status comes back undefined instead of throwing', async () => {
    // Account.getCallStatus is typed `CallStatusResponse | undefined` and returns
    // undefined when the in-memory store misses and the receipt lookup throws.
    // This lands after the transfer is broadcast, so a TypeError here loses the
    // ledger row that meters the period cap.
    let call = 0;
    const { executor } = fakeExecutor({
      status: () => {
        call += 1;
        return call === 1 ? undefined : { status: 200 };
      },
    });

    const out = await ensurePayerFunds(requirement('1000000'), PAYER, executor, {
      balanceReader: async () => 250_000n,
      ...instantly,
    });

    expect(out.ok).toBe(true);
    expect(call).toBe(2); // the undefined round counted as pending, not as a crash
  });

  it('reports the amount when the broadcast returns no call id', async () => {
    const { executor } = fakeExecutor({ sendCalls: () => ({ chainId: 84532 }) });

    const out = await ensurePayerFunds(requirement('1000000'), PAYER, executor, {
      balanceReader: async () => 250_000n,
      ...instantly,
    });

    expect(out.ok).toBe(false);
    // Funds moved with no id to confirm them by, so the amount is the only
    // thing the audit ledger can record.
    expect(out.amount).toBeDefined();
  });
});
