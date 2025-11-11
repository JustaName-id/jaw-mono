import { base, baseSepolia, optimism, optimismSepolia, arbitrum, arbitrumSepolia, mainnet, sepolia } from "viem/chains";

export const getChainNameFromId = (chainId: number): string => {
    const chainMap: Record<number, string> = {
      [mainnet.id]: mainnet.name,
      [sepolia.id]: sepolia.name,
      [base.id]: base.name,
      [baseSepolia.id]: baseSepolia.name,
      [optimism.id]: optimism.name,
      [optimismSepolia.id]: optimismSepolia.name,
      [arbitrum.id]: arbitrum.name,
      [arbitrumSepolia.id]: arbitrumSepolia.name,
    };
    return chainMap[chainId] || `Chain ${chainId}`;
  };
  
  // Helper to get chain icon key from chain id
  export const getChainIconKeyFromId = (chainId: number): string => {
    const chainMap: Record<number, string> = {
      [mainnet.id]: "ethereum",
      [sepolia.id]: "sepolia",
      [base.id]: "base",
      [baseSepolia.id]: "base-sepolia",
      [optimism.id]: "optimism",
      [optimismSepolia.id]: "optimism",
      [arbitrum.id]: "arbitrum",
      [arbitrumSepolia.id]: "arbitrum",
    };
    return chainMap[chainId] || "ethereum";
  };