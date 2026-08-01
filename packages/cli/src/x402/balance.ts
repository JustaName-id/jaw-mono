import { createPublicClient, http, erc20Abi, formatUnits, type Chain, type PublicClient } from 'viem';
import { base, baseSepolia, polygon, polygonAmoy } from 'viem/chains';
import { usdcForNetwork, USDC_BY_NETWORK, type UsdcAsset } from './asset-registry.js';

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

// One client per chain across the process — a fresh transport per read is
// wasted setup once balance checks run more than once per payment.
const clients = new Map<number, PublicClient>();

/** Shared per-chain public client for the x402 modules (reads only). */
export function publicClientFor(chainId: number): PublicClient {
  const chain = CHAINS[chainId];
  if (!chain) throw new Error(`x402: no viem chain configured for chainId ${chainId}`);
  let client = clients.get(chainId);
  if (!client) {
    client = createPublicClient({ chain, transport: http() });
    clients.set(chainId, client);
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
  /** Human-readable USDC (6 decimals). */
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
  return { network, asset: asset.address, raw: raw.toString(), formatted: formatUnits(raw, 6) };
}
