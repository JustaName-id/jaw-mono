import { ethAddress, zeroAddress } from 'viem';
import { JAW_BASE_URL } from '@jaw.id/core';

// Icon URLs that already 404'd this session — later mounts skip straight to the fallback.
const failedIconUrls = new Set<string>();

/**
 * Public token-icon endpoint URL. The zero address (native sentinel) maps to the
 * `0xeeee…` pseudo-address, which the endpoint serves as the chain's native icon.
 */
export function tokenIconUrl(chainId: number, address: string): string {
  const normalized = address.toLowerCase();
  return `${JAW_BASE_URL}/proxy/v2/tokens/${chainId}/${normalized === zeroAddress ? ethAddress : normalized}/icon`;
}

export const hasIconFailed = (url: string) => failedIconUrls.has(url);
export const markIconFailed = (url: string) => {
  failedIconUrls.add(url);
};
