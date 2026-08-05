import { createPublicClient, http, erc20Abi, formatUnits, type Chain, type PublicClient } from 'viem';
import { base, baseSepolia, polygon, polygonAmoy } from 'viem/chains';
import { usdcForNetwork, USDC_BY_NETWORK, type UsdcAsset } from './asset-registry.js';
import { loadConfig } from '../lib/config.js';

// The JAW proxy RPC endpoint, mirrored from core's JAW_RPC_URL. Kept as a local
// literal rather than an import because `@jaw.id/core` is lazy-loaded in the CLI
// (a static import would pull it into startup); keep in sync if core's URL moves.
const JAW_RPC_URL = 'https://api.justaname.id/proxy/v1/rpc';

const CHAINS: Record<number, Chain> = {
  [base.id]: base,
  [baseSepolia.id]: baseSepolia,
  [polygon.id]: polygon,
  [polygonAmoy.id]: polygonAmoy,
};

// The viem chains here and USDC_BY_NETWORK in asset-registry are two lists that
// must cover the same chain ids. Assert it at load so adding a USDC entry
// without its viem chain fails loudly here instead of silently building a
// client with `chain: undefined` (wrong gas/explorer defaults) at read time.
for (const chainId of Object.values(USDC_BY_NETWORK).map((a) => a.chainId)) {
  if (!CHAINS[chainId]) {
    throw new Error(
      `x402 balance: USDC registry has chain ${chainId} but no viem chain is mapped for it in balance.ts`
    );
  }
}

// One client per (chain, apiKey) across the process — a fresh transport per read
// is wasted setup once balance checks run more than once per payment. Keying on
// the apiKey too matters for the long-lived `jaw mcp` server: a first read before
// a key is configured would otherwise cache the public-RPC client forever, so a
// later `jaw config set apiKey` (or a key change) never takes effect. A new key
// yields a new cache entry and a keyed transport; the stale entry just goes cold.
const clients = new Map<string, PublicClient>();

/**
 * Route reads through the same JAW proxy core uses, so the x402 modules see the
 * same node/state core does and don't depend on viem's public RPC fallback
 * (rate-limited and flaky). This matters for the delegation probe in payer.ts:
 * a dropped getCode there would sign a raw signature where a wrapped one was
 * needed. Falls back to the public RPC when no apiKey is configured (e.g. tests).
 */
function rpcTransport(chainId: number, apiKey?: string) {
  if (!apiKey) return http();
  return http(`${JAW_RPC_URL}?chainId=${chainId}&api-key=${apiKey}`);
}

/** Shared per-(chain, apiKey) public client for the x402 modules (reads only). */
export function publicClientFor(chainId: number): PublicClient {
  const chain = CHAINS[chainId];
  if (!chain) throw new Error(`x402: no viem chain configured for chainId ${chainId}`);
  const apiKey = loadConfig().apiKey;
  const key = `${chainId}:${apiKey ?? ''}`;
  let client = clients.get(key);
  if (!client) {
    client = createPublicClient({ chain, transport: rpcTransport(chainId, apiKey) });
    clients.set(key, client);
  }
  return client;
}

/** Reads the raw USDC balance (base units) of `owner`. Injectable for tests. */
export type BalanceReader = (asset: UsdcAsset, owner: `0x${string}`) => Promise<bigint>;

const readOnChain: BalanceReader = (asset, owner) =>
  publicClientFor(asset.chainId).readContract({
    address: asset.address,
    abi: erc20Abi,
    functionName: 'balanceOf',
    args: [owner],
  });

export interface UsdcBalance {
  network: string;
  asset: `0x${string}`;
  /** Base units, decimal string. */
  raw: string;
  /** Human-readable amount, formatted with the asset's decimals from the registry. */
  formatted: string;
}

/**
 * Read an address's USDC balance on a CAIP-2 network so an agent can tell
 * whether it can afford a payment (or confirm one landed).
 */
export async function usdcBalance(
  network: string,
  owner: `0x${string}`,
  read: BalanceReader = readOnChain
): Promise<UsdcBalance> {
  const asset = usdcForNetwork(network);
  if (!asset) throw new Error(`Unsupported x402 network: ${network}`);
  const raw = await read(asset, owner);
  return { network, asset: asset.address, raw: raw.toString(), formatted: formatUnits(raw, asset.decimals) };
}
