import { describe, expect, test } from 'vitest';
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
        return overrides?.sendCalls ? overrides.sendCalls(params) : '0xbatch1';
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

  test('Given a shortfall, When ensuring funds, Then a permitted transfer for exactly the shortfall runs and confirms', async () => {
    const { executor, requests } = fakeExecutor();

    const out = await ensurePayerFunds(requirement('1000000'), PAYER, executor, {
      balanceReader: async () => 250_000n,
      ...instantly,
    });

    expect(out.ok).toBe(true);
    expect(out.amount).toBe('750000');
    expect(out.batchId).toBe('0xbatch1');

    const send = requests.find((r) => r.method === 'wallet_sendCalls');
    const call = (send?.params as Array<{ calls: Array<{ to: string; data: `0x${string}` }> }>)[0].calls[0];
    expect(call.to.toLowerCase()).toBe(BASE_SEPOLIA_USDC.toLowerCase());
    const decoded = decodeFunctionData({ abi: erc20Abi, data: call.data });
    expect(decoded.functionName).toBe('transfer');
    expect(decoded.args).toEqual([PAYER, 750_000n]);
  });

  test('Given a float target above the price, When topping up, Then the refill reaches the float (fewer hops later)', async () => {
    const { executor } = fakeExecutor();

    const out = await ensurePayerFunds(requirement('1000000'), PAYER, executor, {
      balanceReader: async () => 0n,
      floatTarget: 5_000_000n,
      ...instantly,
    });

    expect(out.ok).toBe(true);
    expect(out.amount).toBe('5000000');
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
