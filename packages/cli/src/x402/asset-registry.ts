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
}

export const USDC_BY_NETWORK: Record<string, UsdcAsset> = {
  'eip155:8453': {
    address: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
    chainId: 8453,
    wireNetwork: 'eip155:8453',
    usdcName: 'USD Coin',
    usdcVersion: '2',
  },
  'eip155:84532': {
    address: '0x036CbD53842c5426634e7929541eC2318f3dCF7e',
    chainId: 84532,
    wireNetwork: 'eip155:84532',
    usdcName: 'USDC',
    usdcVersion: '2',
  },
  'eip155:137': {
    address: '0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359',
    chainId: 137,
    wireNetwork: 'eip155:137',
    usdcName: 'USD Coin',
    usdcVersion: '2',
  },
  'eip155:80002': {
    address: '0x41E94Eb019C0762f9Bfcf9Fb1E58725BfB0e7582',
    chainId: 80002,
    wireNetwork: 'eip155:80002',
    usdcName: 'USDC',
    usdcVersion: '2',
  },
};

/** Look up USDC metadata by CAIP-2 network id, or `undefined` if unsupported. */
export function usdcForNetwork(network: string): UsdcAsset | undefined {
  return USDC_BY_NETWORK[network];
}
