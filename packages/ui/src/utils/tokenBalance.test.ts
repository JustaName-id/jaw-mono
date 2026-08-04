import { describe, it, expect, vi, beforeEach } from 'vitest';

// Inlined rather than referencing a module constant: vi.mock factories are
// hoisted above every top-level binding in this file.
vi.mock('@jaw.id/core', () => ({
  SUPPORTED_CHAINS: [
    { id: 1, contracts: { multicall3: { address: '0xca11bde05977b3631167028862be2a173976ca11' } } },
    // A chain viem knows no multicall3 for — the per-token fallback path.
    { id: 999, contracts: {} },
  ],
}));

const MULTICALL3 = { address: '0xca11bde05977b3631167028862be2a173976ca11' as const };

vi.mock('viem', async () => {
  const actual = await vi.importActual<typeof import('viem')>('viem');
  return { ...actual, createPublicClient: vi.fn(), http: vi.fn() };
});

import { createPublicClient } from 'viem';
import { fetchTokenBalances, isNativeToken } from './tokenBalance';

const WALLET = '0x1111111111111111111111111111111111111111';
const USDC = '0x2222222222222222222222222222222222222222';
const DAI = '0x3333333333333333333333333333333333333333';
const NATIVE = '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee';

type MockClient = {
  chain?: { contracts?: { multicall3?: unknown } };
  multicall: ReturnType<typeof vi.fn>;
  readContract: ReturnType<typeof vi.fn>;
  getBalance: ReturnType<typeof vi.fn>;
};

function mockClient(chainId?: number): MockClient {
  const chain =
    chainId === 1 ? { contracts: { multicall3: MULTICALL3 } } : chainId === 999 ? { contracts: {} } : undefined;
  const client: MockClient = {
    chain,
    multicall: vi.fn(),
    readContract: vi.fn(),
    getBalance: vi.fn(),
  };
  vi.mocked(createPublicClient).mockReturnValue(client as never);
  return client;
}

// Each test uses a distinct rpc url so the module-level client cache (which is
// the point of the helper) cannot leak a client between cases.
let rpcCounter = 0;
const nextRpcUrl = () => `https://rpc.test/${++rpcCounter}`;

describe('fetchTokenBalances', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('reads every ERC-20 balance in a single multicall', async () => {
    const client = mockClient(1);
    client.multicall.mockResolvedValue([
      { status: 'success', result: 100n },
      { status: 'success', result: 200n },
    ]);

    const balances = await fetchTokenBalances([USDC, DAI], WALLET, nextRpcUrl(), 1);

    expect(balances).toEqual([100n, 200n]);
    expect(client.multicall).toHaveBeenCalledTimes(1);
    // The whole point: no per-token request.
    expect(client.readContract).not.toHaveBeenCalled();
  });

  it('fetches the native balance alongside the multicall and preserves input order', async () => {
    const client = mockClient(1);
    client.multicall.mockResolvedValue([
      { status: 'success', result: 100n },
      { status: 'success', result: 200n },
    ]);
    client.getBalance.mockResolvedValue(42n);

    const balances = await fetchTokenBalances([USDC, NATIVE, DAI], WALLET, nextRpcUrl(), 1);

    expect(balances).toEqual([100n, 42n, 200n]);
    expect(client.getBalance).toHaveBeenCalledTimes(1);
    expect(client.multicall).toHaveBeenCalledTimes(1);
  });

  it('reports an individually failing token as null without affecting the others', async () => {
    const client = mockClient(1);
    client.multicall.mockResolvedValue([
      { status: 'success', result: 100n },
      { status: 'failure', error: new Error('reverted') },
    ]);

    const balances = await fetchTokenBalances([USDC, DAI], WALLET, nextRpcUrl(), 1);

    expect(balances).toEqual([100n, null]);
  });

  it('falls back to individual reads when the multicall itself fails', async () => {
    const client = mockClient(1);
    client.multicall.mockRejectedValue(new Error('multicall3 not deployed'));
    client.readContract.mockResolvedValueOnce(100n).mockResolvedValueOnce(200n);

    const balances = await fetchTokenBalances([USDC, DAI], WALLET, nextRpcUrl(), 1);

    // A failed batch must not render every fee token unselectable.
    expect(balances).toEqual([100n, 200n]);
    expect(client.readContract).toHaveBeenCalledTimes(2);
  });

  it('uses individual reads on a chain with no known multicall3', async () => {
    const client = mockClient(999);
    client.readContract.mockResolvedValueOnce(100n).mockResolvedValueOnce(200n);

    const balances = await fetchTokenBalances([USDC, DAI], WALLET, nextRpcUrl(), 999);

    expect(client.multicall).not.toHaveBeenCalled();
    expect(balances).toEqual([100n, 200n]);
  });

  it('nulls only the tokens that fail on the fallback path', async () => {
    const client = mockClient(999);
    client.readContract.mockResolvedValueOnce(100n).mockRejectedValueOnce(new Error('reverted'));

    const balances = await fetchTokenBalances([USDC, DAI], WALLET, nextRpcUrl(), 999);

    expect(balances).toEqual([100n, null]);
  });

  it('nulls the native entry when its read fails, leaving ERC-20 results intact', async () => {
    const client = mockClient(1);
    client.multicall.mockResolvedValue([{ status: 'success', result: 100n }]);
    client.getBalance.mockRejectedValue(new Error('rpc down'));

    const balances = await fetchTokenBalances([NATIVE, USDC], WALLET, nextRpcUrl(), 1);

    expect(balances).toEqual([null, 100n]);
  });

  it('makes no requests for an empty token list', async () => {
    const client = mockClient(1);

    await expect(fetchTokenBalances([], WALLET, nextRpcUrl(), 1)).resolves.toEqual([]);

    expect(client.multicall).not.toHaveBeenCalled();
    expect(client.getBalance).not.toHaveBeenCalled();
  });

  it('reuses one client across repeated reads on the same rpc url', async () => {
    const rpcUrl = nextRpcUrl();
    const client = mockClient(1);
    client.multicall.mockResolvedValue([{ status: 'success', result: 1n }]);

    await fetchTokenBalances([USDC], WALLET, rpcUrl, 1);
    await fetchTokenBalances([USDC], WALLET, rpcUrl, 1);

    expect(createPublicClient).toHaveBeenCalledTimes(1);
  });
});

describe('isNativeToken', () => {
  it('recognizes both native conventions regardless of case', () => {
    expect(isNativeToken('0x0000000000000000000000000000000000000000')).toBe(true);
    expect(isNativeToken('0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE')).toBe(true);
    expect(isNativeToken(USDC)).toBe(false);
  });
});
