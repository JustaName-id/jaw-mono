/**
 * Chain utility functions
 * Extracted to break require cycles between ReactNativeUIHandler and wrappers
 */

export const CHAIN_NAMES: Record<number, string> = {
  1: 'Ethereum',
  11155111: 'Sepolia',
  8453: 'Base',
  84532: 'Base Sepolia',
  137: 'Polygon',
  42161: 'Arbitrum One',
  421614: 'Arbitrum Sepolia',
  10: 'Optimism',
  11155420: 'Optimism Sepolia',
};

export function getChainNameFromId(chainId: number): string {
  return CHAIN_NAMES[chainId] || 'Unknown Network';
}

export function getChainIconKeyFromId(chainId: number): string {
  const chainIconMap: Record<number, string> = {
    1: 'ethereum',
    11155111: 'ethereum',
    8453: 'base',
    84532: 'base',
    137: 'polygon',
    42161: 'arbitrum',
    421614: 'arbitrum',
    10: 'optimism',
    11155420: 'optimism',
  };
  return chainIconMap[chainId] || 'ethereum';
}
