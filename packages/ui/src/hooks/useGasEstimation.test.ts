// @vitest-environment jsdom
// Executes the fee-selection paths of useGasEstimation with realistic calldata (a USDC
// transfer from a USDC-only account) and scripted bundler outcomes, covering the
// auto-switch rules: prefund errors and unrecognized ETH-estimation failures fall back to
// an ERC-20 whose paymaster estimate succeeded (proven by its priced ceiling), while call
// reverts and balance shortfalls are reported instead of re-routed, and a user's own token
// choice survives a re-estimation.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createElement, useState } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react';
import type { Address } from 'viem';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

vi.mock('@jaw.id/core', () => ({
  estimateErc20PaymasterCosts: vi.fn(),
  JAW_PAYMASTER_URL: 'https://paymaster.test',
}));

import { estimateErc20PaymasterCosts } from '@jaw.id/core';
import type { Account } from '@jaw.id/core';
import { useGasEstimation, type UseGasEstimationResult, type TransactionCall } from './useGasEstimation';
import type { FeeTokenOption } from '../components/FeeTokenSelector';

const erc20Mock = vi.mocked(estimateErc20PaymasterCosts);

// Base Sepolia USDC, and a plain ERC-20 transfer of 1 USDC — the calldata a
// USDC-only account would actually submit.
const USDC = '0x036CbD53842c5426634e7929541eC2318f3dCF7e' as Address;
const USDT = '0xdAC17F958D2ee523a2206206994597C13D831ec7' as Address;
const RECIPIENT = '0x1111111111111111111111111111111111111111';
const TRANSFER_CALLDATA = ('0xa9059cbb' +
  RECIPIENT.slice(2).padStart(64, '0') +
  (1_000_000).toString(16).padStart(64, '0')) as `0x${string}`;
const CALLS: TransactionCall[] = [{ to: USDC, value: 0n, data: TRANSFER_CALLDATA }];

const makeAccount = (calculateGasCost: () => Promise<string>): Account =>
  ({
    calculateGasCost,
    getSmartAccountFor: async () => ({}),
    getChain: () => ({ id: 84532 }),
  }) as unknown as Account;

const token = (over: Partial<FeeTokenOption>): FeeTokenOption => ({
  uid: over.symbol ?? 'tok',
  symbol: 'USDC',
  address: USDC,
  decimals: 6,
  balance: 10_000_000n,
  balanceFormatted: '10',
  isNative: false,
  // The producer's pre-estimation heuristic (balance >= 0.5) — NOT proof it can pay.
  isSelectable: true,
  ...over,
});

const nativeEth = (balance: bigint) =>
  token({
    symbol: 'ETH',
    address: '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE',
    decimals: 18,
    balance,
    balanceFormatted: balance > 0n ? '1' : '0',
    isNative: true,
    isSelectable: balance > 0n,
  });

const usdcEstimate = {
  tokenAddress: USDC,
  tokenCostFormatted: '0.02',
  tokenCostMaxFormatted: '0.05',
  hasSufficientBalance: true,
};
const usdtEstimate = { ...usdcEstimate, tokenAddress: USDT };

let hook: UseGasEstimationResult;
let tokensNow: FeeTokenOption[];

function Probe({ account, initialTokens }: { account: Account; initialTokens: FeeTokenOption[] }) {
  const [tokens, setTokens] = useState(initialTokens);
  tokensNow = tokens;
  hook = useGasEstimation({
    account,
    transactionCalls: CALLS,
    chainId: 84532,
    apiKey: 'test-key',
    feeTokens: tokens,
    onFeeTokensUpdate: setTokens,
  });
  return null;
}

let root: Root | null = null;

async function mount(account: Account, initialTokens: FeeTokenOption[]) {
  root = createRoot(document.createElement('div'));
  await act(async () => {
    root!.render(createElement(Probe, { account, initialTokens }));
  });
  await settle();
}

async function settle() {
  for (let i = 0; i < 20 && hook.gasFeeLoading; i++) {
    await act(() => Promise.resolve());
  }
  expect(hook.gasFeeLoading).toBe(false);
}

beforeEach(() => {
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
});

afterEach(() => {
  if (root) act(() => root!.unmount());
  root = null;
  vi.restoreAllMocks();
});

describe('useGasEstimation fee-token selection', () => {
  it('funded account, clean estimation: auto-selects native', async () => {
    erc20Mock.mockResolvedValue([usdcEstimate]);
    await mount(
      makeAccount(async () => '0.0002'),
      [nativeEth(10n ** 18n), token({})]
    );

    expect(hook.gasFee).toBe('0.0002');
    expect(hook.gasEstimationError).toBe('');
    expect(hook.selectedFeeToken?.isNative).toBe(true);
    expect(hook.isPayingWithErc20).toBe(false);
  });

  it('USDC-only account, AA21 prefund error: auto-switches to USDC', async () => {
    erc20Mock.mockResolvedValue([usdcEstimate]);
    await mount(
      makeAccount(async () => {
        throw new Error("UserOperation reverted during simulation: AA21 didn't pay prefund");
      }),
      [nativeEth(0n), token({})]
    );

    expect(hook.gasEstimationError).toBe('');
    expect(hook.selectedFeeToken?.symbol).toBe('USDC');
    expect(hook.isPayingWithErc20).toBe(true);
    expect(hook.selectedFeeToken?.gasCostMaxFormatted).toBe('0.05');
  });

  it('USDC-only account, unrecognized bundler wording: still auto-switches to the proven USDC', async () => {
    erc20Mock.mockResolvedValue([usdcEstimate]);
    await mount(
      makeAccount(async () => {
        throw new Error('bundler rejected the operation: gas prefund could not be covered by sender');
      }),
      [nativeEth(0n), token({})]
    );

    expect(hook.gasEstimationError).toBe('');
    expect(hook.selectedFeeToken?.symbol).toBe('USDC');
    expect(hook.isPayingWithErc20).toBe(true);
  });

  it('call revert fails both paths: reports failure, never re-routes the fee', async () => {
    const revert = new Error('execution reverted: INSUFFICIENT_OUTPUT_AMOUNT');
    erc20Mock.mockRejectedValue(revert);
    await mount(
      makeAccount(async () => {
        throw revert;
      }),
      [nativeEth(0n), token({})]
    );

    expect(hook.gasEstimationError).toBe('Failed to estimate gas');
    expect(hook.selectedFeeToken).toBeNull();
    // The rejected ERC-20 estimation must strip the heuristic selectability.
    expect(tokensNow.find((t) => !t.isNative)?.isSelectable).toBe(false);
  });

  it('balance-classified revert: reports Insufficient funds even with a proven USDC available', async () => {
    erc20Mock.mockResolvedValue([usdcEstimate]);
    await mount(
      makeAccount(async () => {
        throw new Error('execution reverted: ERC20: transfer amount exceeds balance');
      }),
      [nativeEth(0n), token({})]
    );

    expect(hook.gasEstimationError).toBe('Insufficient funds');
    expect(hook.selectedFeeToken).toBeNull();
  });

  it('unknown error with only heuristic selectability (no ceiling): no auto-switch', async () => {
    // Estimation "succeeds" but returns nothing for the token — its isSelectable stays the
    // pre-estimation balance heuristic, which must not count as proof it can pay.
    erc20Mock.mockResolvedValue([]);
    await mount(
      makeAccount(async () => {
        throw new Error('Internal JSON-RPC error');
      }),
      [nativeEth(0n), token({})]
    );

    expect(hook.gasEstimationError).toBe('Failed to estimate gas');
    expect(hook.selectedFeeToken).toBeNull();
  });

  it("re-estimation failure keeps the user's own ERC-20 choice", async () => {
    erc20Mock.mockResolvedValue([usdcEstimate, usdtEstimate]);
    await mount(
      makeAccount(async () => {
        throw new Error('bundler timeout while estimating');
      }),
      [nativeEth(0n), token({}), token({ symbol: 'USDT', address: USDT })]
    );

    expect(hook.selectedFeeToken?.symbol).toBe('USDC'); // first proven token wins initially

    const usdt = tokensNow.find((t) => t.symbol === 'USDT');
    expect(usdt?.gasCostMaxFormatted).toBe('0.05');
    act(() => hook.setSelectedFeeToken(usdt!));

    await act(async () => {
      hook.refetch();
    });
    await settle();

    expect(hook.gasEstimationError).toBe('');
    expect(hook.selectedFeeToken?.symbol).toBe('USDT');
  });
});
