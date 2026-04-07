/**
 * Truncates an Ethereum address for display
 * Shows first 6 characters + ... + last 4 characters
 *
 * @example
 * formatAddress('0x1234567890abcdef1234567890abcdef12345678')
 * // Returns: '0x1234...5678'
 */
export const formatAddress = (address: string): string => {
  if (!address || address.length < 10) return address;
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
};

/**
 * Returns the display string for an address - either the resolved name or formatted address
 *
 * @param resolvedName - The resolved ENS/subname (if any)
 * @param address - The raw Ethereum address
 * @returns The resolved name if available, otherwise the formatted address
 */
export const getDisplayAddress = (resolvedName: string | null | undefined, address: string): string => {
  if (resolvedName) return resolvedName;
  return formatAddress(address);
};
