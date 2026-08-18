import { describe, expect, it, vi } from 'vitest';
import { createPublicClient, encodeFunctionData, http, parseAbi, type Address, type Hex } from 'viem';
import { base } from 'viem/chains';

// Live smoke against Base through the JAW proxy. Needs a real key, so it no-ops without one:
//   JAW_KEY=<api-key> bunx vitest run src/utils/assetPreview.smoke.test.ts
const KEY = process.env.JAW_KEY ?? '';
const RPC = `https://api.justaname.id/proxy/v1/rpc?chainId=8453&api-key=${KEY}`;

// Same shape getJawPublicClient builds: chain attached (for multicall3), batch.multicall on.
const real = createPublicClient({ chain: base, transport: http(RPC), batch: { multicall: true } });
vi.mock('./publicClient', () => ({
  getJawPublicClient: () => real,
  getPublicClient: () => real,
  jawRpcUrl: () => RPC,
}));

const { simulateAssetChanges } = await import('./assetPreview');

type Rec = { method: string; start: number; end: number };
let recs: Rec[] = [];
let t0 = 0;
const realFetch = globalThis.fetch;
globalThis.fetch = (async (input: any, init: any) => {
  let method = '?';
  try {
    const b = JSON.parse(init?.body ?? '{}');
    method = Array.isArray(b) ? `jsonrpc-batch(${b.length})` : b.method;
  } catch {}
  const start = performance.now() - t0;
  const res = await realFetch(input, init);
  recs.push({ method, start, end: performance.now() - t0 });
  return res;
}) as any;

/** Group into waves: a new wave starts when a request begins after every prior one finished. */
function waves(rs: Rec[]) {
  const sorted = [...rs].sort((a, b) => a.start - b.start);
  const out: Rec[][] = [];
  let cur: Rec[] = [];
  let curEnd = -1;
  for (const r of sorted) {
    if (cur.length && r.start >= curEnd - 2) {
      out.push(cur);
      cur = [];
      curEnd = -1;
    }
    cur.push(r);
    curEnd = Math.max(curEnd, r.end);
  }
  if (cur.length) out.push(cur);
  return out;
}

async function run(name: string, account: Address, calls: { to: Address; data?: Hex; value?: bigint }[]) {
  recs = [];
  t0 = performance.now();
  const wall = performance.now();
  const r = await simulateAssetChanges({ chainId: 8453, apiKey: KEY, account, calls: calls as never });
  const ms = Math.round(performance.now() - wall);
  const w = waves(recs);
  console.log(`\n${'─'.repeat(76)}\n${name}`);
  console.log(
    `willRevert=${r.willRevert}${r.revertCause ? ` cause=${r.revertCause}` : ''}   wall=${ms}ms   requests=${recs.length}   serial waves=${w.length}`
  );
  for (const d of r.deltas)
    console.log(
      `   ${d.direction === 'out' ? '−' : '+'} ${d.amountFormatted.padEnd(20)} ${(d.symbol ?? '???').padEnd(9)} dec=${String(d.decimals).padEnd(3)} native=${String(d.isNative).padEnd(5)} ${d.address}`
    );
  if (!r.deltas.length) console.log('   (no deltas)');
  w.forEach((wave, i) => {
    const c = wave.reduce<Record<string, number>>((a, x) => ((a[x.method] = (a[x.method] ?? 0) + 1), a), {});
    console.log(
      `   wave ${i + 1}: ${Object.entries(c)
        .map(([m, n]) => (n > 1 ? `${m}×${n}` : m))
        .join(
          ', '
        )}  [${Math.round(Math.min(...wave.map((x) => x.start)))}→${Math.round(Math.max(...wave.map((x) => x.end)))}ms]`
    );
  });
  return r;
}

const USDC = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913' as Address;
const WETH = '0x4200000000000000000000000000000000000006' as Address;
const BRZ = '0xa360c63e8e4e7ce584d8f41fb071bc80b56a3e93' as Address;
const MORPHO = '0xBBBBBbbBBb9cC5e90e3b3Af64bdAF62C37EEFFCb' as Address;
const FEEVAULT = '0x4200000000000000000000000000000000000011' as Address;
const BRZ_OWNER = '0xc8a30ee84cce536217240990196559f80a09a519' as Address;
const SINK = '0x000000000000000000000000000000000000dEaD' as Address;
const EMPTY = '0x00000000000000000000000000000000000f0f0f' as Address;
const UNIV3 = '0xd0b53D9277642d899DF5C87A3966A349A798F224' as Address;

const erc20 = parseAbi(['function transfer(address,uint256) returns (bool)', 'function deposit() payable']);
const erc721 = parseAbi(['function transferFrom(address,address,uint256)']);
const tx = (to: Address, functionName: 'transfer' | 'deposit', args?: never) => ({
  to,
  data: encodeFunctionData({ abi: erc20, functionName, args } as never),
});

describe.skipIf(!KEY)('assetPreview against Base via the JAW proxy', () => {
  it('1. plain ERC-20 transfer', async () => {
    const r = await run('1. ERC-20 — 100 USDC out', MORPHO, [
      { to: USDC, data: encodeFunctionData({ abi: erc20, functionName: 'transfer', args: [SINK, 100_000_000n] }) },
    ]);
    expect(r.willRevert).toBe(false);
    expect(r.deltas).toEqual([
      expect.objectContaining({ symbol: 'USDC', decimals: 6, direction: 'out', amountFormatted: '100' }),
    ]);
  }, 60_000);

  it('2. native ETH send — exercises the to-less eth_call balance probe', async () => {
    const r = await run('2. Native — 0.001 ETH out', FEEVAULT, [{ to: SINK, value: 10n ** 15n }]);
    expect(r.willRevert).toBe(false);
    expect(r.deltas).toEqual([
      expect.objectContaining({ isNative: true, decimals: 18, direction: 'out', amountFormatted: '0.001' }),
    ]);
  }, 60_000);

  it('3. dependent batch — 2nd call only valid after the 1st', async () => {
    const r = await run('3. Dependent — WETH deposit, then transfer half', FEEVAULT, [
      { to: WETH, data: encodeFunctionData({ abi: erc20, functionName: 'deposit' }), value: 10n ** 15n },
      { to: WETH, data: encodeFunctionData({ abi: erc20, functionName: 'transfer', args: [SINK, 5n * 10n ** 14n] }) },
    ]);
    expect(r.willRevert).toBe(false);
    // The output token of a dependent batch is exactly what the old per-call discovery lost.
    expect(r.deltas.map((d) => d.symbol).sort()).toEqual(['ETH', 'WETH']);
    expect(r.deltas.find((d) => d.symbol === 'WETH')).toMatchObject({ direction: 'in', amountFormatted: '0.0005' });
  }, 60_000);

  it('4. ERC-721 transfer — renders as a count, not 0.1', async () => {
    const r = await run('4. ERC-721 — BRZ #1 out', BRZ_OWNER, [
      { to: BRZ, data: encodeFunctionData({ abi: erc721, functionName: 'transferFrom', args: [BRZ_OWNER, SINK, 1n] }) },
    ]);
    expect(r.willRevert).toBe(false);
    expect(r.deltas).toEqual([
      expect.objectContaining({ decimals: 0, direction: 'out', amountFormatted: '1', isNative: false }),
    ]);
  }, 60_000);

  it('6. multi-asset batch — pre-balance fan-out scales with N', async () => {
    const r = await run('6. Multi-asset — USDC + WETH out of the UniV3 pool', UNIV3, [
      { to: USDC, data: encodeFunctionData({ abi: erc20, functionName: 'transfer', args: [SINK, 100_000_000n] }) },
      { to: WETH, data: encodeFunctionData({ abi: erc20, functionName: 'transfer', args: [SINK, 10n ** 15n] }) },
    ]);
    expect(r.willRevert).toBe(false);
    expect(r.deltas.map((d) => d.symbol).sort()).toEqual(['USDC', 'WETH']);
  }, 60_000);

  it('5. reverting batch', async () => {
    const r = await run('5. Revert — USDC transfer from an empty account', EMPTY, [
      { to: USDC, data: encodeFunctionData({ abi: erc20, functionName: 'transfer', args: [MORPHO, 100_000_000n] }) },
    ]);
    expect(r.willRevert).toBe(true);
    expect(r.deltas).toEqual([]);
  }, 60_000);
});
