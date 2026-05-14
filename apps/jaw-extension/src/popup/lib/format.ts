/**
 * Small formatting helpers for the popup. No SDK dependencies; safe to call
 * from any popup component without bundling viem into the popup chunk.
 */

export function truncateAddress(address: string | undefined, charsEachSide = 6): string {
  if (!address) return '';
  if (address.length <= charsEachSide * 2 + 2) return address;
  return `${address.slice(0, charsEachSide + 2)}…${address.slice(-charsEachSide)}`;
}

/**
 * Formats a hex-encoded wei balance to a short human string in the native
 * symbol's units. Returns 4 decimals by default (good enough for popup
 * display; not for sending).
 */
export function formatBalanceFromHex(hex: string | undefined, decimals = 18, fractionDigits = 4): string {
  if (!hex) return '0';
  let value: bigint;
  try {
    value = BigInt(hex);
  } catch {
    return '0';
  }
  if (value === 0n) return '0';
  const divisor = 10n ** BigInt(decimals);
  const whole = value / divisor;
  const fraction = value % divisor;
  if (fraction === 0n) return whole.toString();
  // Pad fraction with leading zeros so 1 wei doesn't render as "0.1".
  const fractionStr = fraction.toString().padStart(decimals, '0').slice(0, fractionDigits);
  // Trim trailing zeros (e.g. "10000" → "1") but keep at least one digit.
  const trimmed = fractionStr.replace(/0+$/, '') || '0';
  return `${whole.toString()}.${trimmed}`;
}
