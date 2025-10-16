import { arbitrum, base, optimism } from 'viem/chains'

export const SUPPORTED_CHAINS_NAMES = {
    [base.id]: "Base",
    [optimism.id]: "Optimism",
    [arbitrum.id]: "Arbitrum",
    // [mainnet.id]: "Mainnet",
    // [baseSepolia.id]: "Base Sepolia",
    // [optimismSepolia.id]: "Optimism Sepolia",
    // [arbitrumSepolia.id]: "Arbitrum Sepolia",
    // [sepolia.id]: "Sepolia",
  } as const

  export const SUPPORTED_CHAINS = [
    // mainnet,
    base,
    optimism,
    arbitrum
]