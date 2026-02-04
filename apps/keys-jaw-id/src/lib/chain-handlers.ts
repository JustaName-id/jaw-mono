import { SUPPORTED_CHAINS } from "@jaw.id/core";

export const getChainNameFromId = (chainId: number): string => {
  const chain = SUPPORTED_CHAINS.find(c => c.id === chainId);
  return chain?.name || `Chain ${chainId}`;
};