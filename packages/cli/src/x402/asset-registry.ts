// USDC asset registry, mirrored from the backend's
// `apps/ens/src/external/payment/asset-registry.ts`. Keep this in sync when the
// server adds a chain. `wireNetwork` is the CAIP-2 id used on the x402 v2 wire.

export interface UsdcAsset {
  address: `0x${string}`;
  chainId: number;
  wireNetwork: string;
  /** EIP-712 domain `name` for this deployment's USDC. */
  usdcName: string;
  /** EIP-712 domain `version`. */
  usdcVersion: string;
  /**
   * Token decimals. Every USDC deployment here is 6, but carrying it on the
   * registry entry (rather than a literal `6` at the format site) keeps the
   * source of truth in one place and is ready for a non-6-decimal asset when
   * the registry grows past USDC. Reading it off-chain from the contract is
   * deliberately avoided: the registry is a controlled allowlist, so an extra
   * RPC round-trip and trusting a token's self-reported decimals buy nothing.
   */
  decimals: number;
}

export const USDC_BY_NETWORK: Record<string, UsdcAsset> = {
  'eip155:8453': {
    address: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
    chainId: 8453,
    wireNetwork: 'eip155:8453',
    usdcName: 'USD Coin',
    usdcVersion: '2',
    decimals: 6,
  },
  'eip155:84532': {
    address: '0x036CbD53842c5426634e7929541eC2318f3dCF7e',
    chainId: 84532,
    wireNetwork: 'eip155:84532',
    usdcName: 'USDC',
    usdcVersion: '2',
    decimals: 6,
  },
  'eip155:137': {
    address: '0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359',
    chainId: 137,
    wireNetwork: 'eip155:137',
    usdcName: 'USD Coin',
    usdcVersion: '2',
    decimals: 6,
  },
  'eip155:80002': {
    address: '0x41E94Eb019C0762f9Bfcf9Fb1E58725BfB0e7582',
    chainId: 80002,
    wireNetwork: 'eip155:80002',
    usdcName: 'USDC',
    usdcVersion: '2',
    decimals: 6,
  },
};

/**
 * Look up USDC metadata by CAIP-2 network id, or `undefined` if unsupported.
 *
 * Own keys only. The network reaches here from a 402 challenge and from the
 * Bazaar catalogue, both untrusted, and a plain index answers `constructor` or
 * `toString` with something off the prototype: callers then read `.address` off
 * a function and throw where they expected an unsupported network.
 */
export function usdcForNetwork(network: string): UsdcAsset | undefined {
  return Object.hasOwn(USDC_BY_NETWORK, network) ? USDC_BY_NETWORK[network] : undefined;
}
