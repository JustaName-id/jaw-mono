import { createPublicClient, http, erc20Abi, formatUnits, type Chain } from 'viem';
import { base, baseSepolia, polygon, polygonAmoy } from 'viem/chains';
import { usdcForNetwork, type UsdcAsset } from './asset-registry.js';

const CHAINS: Record<number, Chain> = {
  [base.id]: base,
  [baseSepolia.id]: baseSepolia,
  [polygon.id]: polygon,
  [polygonAmoy.id]: polygonAmoy,
};

/** Reads the raw USDC balance (base units) of `owner`. Injectable for tests. */
export type BalanceReader = (asset: UsdcAsset, owner: `0x${string}`) => Promise<bigint>;

const readOnChain: BalanceReader = (asset, owner) => {
  const chain = CHAINS[asset.chainId];
  const client = createPublicClient({ chain, transport: http() });
  return client.readContract({ address: asset.address, abi: erc20Abi, functionName: 'balanceOf', args: [owner] });
};

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
