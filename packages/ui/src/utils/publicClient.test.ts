import { afterEach, describe, expect, it, vi } from 'vitest';
import { decodeFunctionData, encodeFunctionResult, type Hex } from 'viem';

import { getPublicClient, jawRpcUrl } from './publicClient';
import { fetchTokenBalance } from './tokenBalance';

// Base — carries a Multicall3 address in viem's chain definition.
const CHAIN_WITH_MULTICALL = 8453;
// Not in SUPPORTED_CHAINS, so the client is built without a chain and viem has
// no Multicall3 address to batch through.
const CHAIN_WITHOUT_MULTICALL = 999_999;

const MULTICALL3 = '0xca11bde05977b3631167028862be2a173976ca11';
const HOLDER = '0x71f2F1c2dc94cDaBFE29Cb355119f8683AE0969b';
const TOKENS = [
  '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
  '0x4200000000000000000000000000000000000006',
  '0x50c5725949A6F0c72E6C4a641F24049A917DB0Cb',
];

const aggregate3Abi = [
  {
    type: 'function',
    name: 'aggregate3',
    stateMutability: 'payable',
    inputs: [
      {
        name: 'calls',
        type: 'tuple[]',
        components: [
          { name: 'target', type: 'address' },
          { name: 'allowFailure', type: 'bool' },
          { name: 'callData', type: 'bytes' },
        ],
      },
    ],
    outputs: [
      {
        name: 'returnData',
        type: 'tuple[]',
        components: [
          { name: 'success', type: 'bool' },
          { name: 'returnData', type: 'bytes' },
        ],
      },
    ],
  },
] as const;

const word = (n: bigint): Hex => `0x${n.toString(16).padStart(64, '0')}`;

const json = (id: number, result: Hex) =>
  new Response(JSON.stringify({ jsonrpc: '2.0', id, result }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });

/**
 * Stub `fetch` with a node that answers `eth_call` — both plain and wrapped in a
 * Multicall3 `aggregate3`. Returns the list of request bodies actually sent, so
 * a test can assert how many round-trips a fan-out cost.
 */
function stubRpc() {
  const bodies: { method: string; to?: string; data?: Hex }[] = [];

  vi.stubGlobal(
    'fetch',
    vi.fn(async (_url: string, init: RequestInit) => {
      const body = JSON.parse(String(init.body)) as {
        id: number;
        method: string;
        params: [{ to?: string; data?: Hex }];
      };
      bodies.push({ method: body.method, to: body.params?.[0]?.to, data: body.params?.[0]?.data });

      const { to, data } = body.params[0];

      if (to?.toLowerCase() === MULTICALL3) {
        const { args } = decodeFunctionData({ abi: aggregate3Abi, data: data as Hex });
        const calls = args[0] as readonly { target: string }[];
        return json(
          body.id,
          encodeFunctionResult({
            abi: aggregate3Abi,
            functionName: 'aggregate3',
            result: calls.map((_, i) => ({ success: true, returnData: word(BigInt(i + 1)) })),
          }) as Hex
        );
      }

      return json(body.id, word(1n));
    })
  );

  return bodies;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('getPublicClient', () => {
  it('returns the same instance for the same chain and RPC URL', () => {
    const url = jawRpcUrl(CHAIN_WITH_MULTICALL, 'key-a');
    expect(getPublicClient(CHAIN_WITH_MULTICALL, url)).toBe(getPublicClient(CHAIN_WITH_MULTICALL, url));
  });

  it('returns distinct instances for different RPC URLs', () => {
    const a = getPublicClient(CHAIN_WITH_MULTICALL, jawRpcUrl(CHAIN_WITH_MULTICALL, 'key-b'));
    const b = getPublicClient(CHAIN_WITH_MULTICALL, jawRpcUrl(CHAIN_WITH_MULTICALL, 'key-c'));
    expect(a).not.toBe(b);
  });

  it('builds the JAW RPC URL with and without an API key', () => {
    expect(jawRpcUrl(8453, 'abc')).toContain('chainId=8453&api-key=abc');
    expect(jawRpcUrl(8453)).toContain('chainId=8453');
    expect(jawRpcUrl(8453)).not.toContain('api-key');
  });
});

describe('fetchTokenBalance batching', () => {
  it('folds a concurrent ERC-20 fan-out into one Multicall3 request', async () => {
    const bodies = stubRpc();
    const rpcUrl = 'https://rpc.test/multicall-fanout';

    const balances = await Promise.all(
      TOKENS.map((token) => fetchTokenBalance(token, HOLDER, rpcUrl, CHAIN_WITH_MULTICALL))
    );

    // Three reads, one round-trip, addressed to Multicall3.
    expect(bodies).toHaveLength(1);
    expect(bodies[0].to?.toLowerCase()).toBe(MULTICALL3);
    // Each caller still gets its own decoded result, in its own order.
    expect(balances).toEqual([1n, 2n, 3n]);
  });

  it('falls back to one request per call when the chain has no Multicall3', async () => {
    const bodies = stubRpc();
    const rpcUrl = 'https://rpc.test/no-multicall';

    const balances = await Promise.all(
      TOKENS.map((token) => fetchTokenBalance(token, HOLDER, rpcUrl, CHAIN_WITHOUT_MULTICALL))
    );

    expect(bodies).toHaveLength(TOKENS.length);
    expect(bodies.every((b) => b.to?.toLowerCase() !== MULTICALL3)).toBe(true);
    expect(balances).toEqual([1n, 1n, 1n]);
  });

  it('does not batch when callers omit the chain id', async () => {
    const bodies = stubRpc();
    const rpcUrl = 'https://rpc.test/no-chain-id';

    await Promise.all(TOKENS.map((token) => fetchTokenBalance(token, HOLDER, rpcUrl)));

    expect(bodies).toHaveLength(TOKENS.length);
  });
});
