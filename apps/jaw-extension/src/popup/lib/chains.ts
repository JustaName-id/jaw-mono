/**
 * Single source of truth for popup chain display metadata.
 *
 * Pulls name/explorer/symbol from `viem/chains` (already a transitive dep via
 * @jaw.id/core) rather than hard-coding strings. Keeps the popup in sync with
 * what JAW SDK actually supports — chains exposed here are exactly those in
 * `packages/core/src/account/smartAccount.ts` (MAINNET_CHAINS + TESTNET_CHAINS).
 *
 * IMPORTANT: this is a static metadata catalog only. The list of chains the
 * USER can currently switch to comes from the offscreen SDK's chain store at
 * runtime; we just render display strings for whatever the SDK exposes.
 */

import {
  arbitrum,
  arbitrumSepolia,
  avalanche,
  avalancheFuji,
  base,
  baseSepolia,
  bsc,
  celo,
  celoSepolia,
  flare,
  gnosis,
  ink,
  inkSepolia,
  linea,
  mainnet,
  optimism,
  optimismSepolia,
  sepolia,
} from 'viem/chains';
import type { Chain as ViemChain } from 'viem';

export interface ChainMeta {
  id: number;
  name: string;
  shortName: string;
  nativeSymbol: string;
  explorerUrl: string;
  isTestnet: boolean;
}

// Order matches `MAINNET_CHAINS` then `TESTNET_CHAINS` in smartAccount.ts so
// the dropdown lists mainnets first, then testnets.
const VIEM_MAINNETS: ViemChain[] = [mainnet, base, optimism, arbitrum, linea, avalanche, bsc, celo, flare, ink, gnosis];

const VIEM_TESTNETS: ViemChain[] = [
  sepolia,
  baseSepolia,
  optimismSepolia,
  arbitrumSepolia,
  celoSepolia,
  avalancheFuji,
  inkSepolia,
];

function toMeta(chain: ViemChain, isTestnet: boolean): ChainMeta {
  const explorerUrl = chain.blockExplorers?.default?.url ?? '';
  return {
    id: chain.id,
    name: chain.name,
    shortName: chain.name.split(' ')[0] ?? chain.name,
    nativeSymbol: chain.nativeCurrency.symbol,
    explorerUrl,
    isTestnet,
  };
}

const META_BY_ID: Map<number, ChainMeta> = new Map(
  [...VIEM_MAINNETS.map((c) => toMeta(c, false)), ...VIEM_TESTNETS.map((c) => toMeta(c, true))].map((m) => [m.id, m])
);

export function getChainMeta(chainIdHex: string | null | undefined): ChainMeta | undefined {
  if (!chainIdHex) return undefined;
  const id = chainIdHex.startsWith('0x') ? parseInt(chainIdHex, 16) : Number(chainIdHex);
  if (!Number.isFinite(id)) return undefined;
  return META_BY_ID.get(id);
}

export function listChains(opts: { includeTestnets: boolean }): ChainMeta[] {
  const out: ChainMeta[] = [];
  for (const m of META_BY_ID.values()) {
    if (m.isTestnet && !opts.includeTestnets) continue;
    out.push(m);
  }
  return out;
}

export function toHexChainId(id: number): `0x${string}` {
  return `0x${id.toString(16)}` as `0x${string}`;
}
