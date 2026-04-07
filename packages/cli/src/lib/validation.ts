export function isValidAddress(value: string): boolean {
  return /^0x[0-9a-fA-F]{40}$/.test(value);
}

export function isValidHex(value: string): boolean {
  return /^0x[0-9a-fA-F]*$/.test(value);
}

export function isValidChainId(value: string | number): boolean {
  const num = typeof value === 'string' ? parseInt(value, 10) : value;
  return Number.isInteger(num) && num > 0;
}

export function parseChainId(value: string): number {
  const num = parseInt(value, 10);
  if (!isValidChainId(num)) {
    throw new Error(`Invalid chain ID: ${value}`);
  }
  return num;
}

export function assertAddress(value: string, label = 'address'): `0x${string}` {
  if (!isValidAddress(value)) {
    throw new Error(`Invalid ${label}: ${value}`);
  }
  return value as `0x${string}`;
}

export function parseWei(raw: string, label = 'value'): bigint {
  try {
    return BigInt(raw);
  } catch {
    throw new Error(`Invalid ${label}: "${raw}" is not a valid wei amount`);
  }
}

export function isValidKeysUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    const isTrustedHost =
      parsed.hostname.endsWith('.jaw.id') ||
      parsed.hostname === 'jaw.id' ||
      parsed.hostname === 'localhost' ||
      parsed.hostname === '127.0.0.1';
    const isSecure = parsed.protocol === 'https:' || parsed.hostname === 'localhost' || parsed.hostname === '127.0.0.1';
    return isTrustedHost && isSecure;
  } catch {
    return false;
  }
}

export function isValidRelayUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    const isTrustedHost =
      parsed.hostname.endsWith('.jaw.id') ||
      parsed.hostname === 'jaw.id' ||
      parsed.hostname === 'localhost' ||
      parsed.hostname === '127.0.0.1';
    const isSecure = parsed.protocol === 'wss:' || parsed.hostname === 'localhost' || parsed.hostname === '127.0.0.1';
    const isWebSocket = parsed.protocol === 'wss:' || parsed.protocol === 'ws:';
    return isTrustedHost && isSecure && isWebSocket;
  } catch {
    return false;
  }
}
