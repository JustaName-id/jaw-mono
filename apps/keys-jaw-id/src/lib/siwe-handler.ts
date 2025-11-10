/**
 * SIWE (Sign-In with Ethereum) message detection and handling utilities
 * Based on EIP-4361: https://eips.ethereum.org/EIPS/eip-4361
 */

/**
 * Detects if a message is a SIWE (Sign-In with Ethereum) message
 * according to EIP-4361 specification
 *
 * @param message - The message to check (can be hex or plaintext)
 * @returns true if the message is a valid SIWE message
 */
export function isSiweMessage(message: string): boolean {
  if (!message) return false;

  try {
    // If message is hex-encoded, decode it first
    let decodedMessage = message;
    if (message.startsWith('0x')) {
      decodedMessage = hexToUtf8(message);
    }

    // Primary detection: Check for the SIWE signature phrase
    // Per EIP-4361: "wants you to sign in with your Ethereum account"
    const hasSiwePhrase = decodedMessage.includes('wants you to sign in with your Ethereum account');

    if (!hasSiwePhrase) {
      return false;
    }

    // Additional validation: Check for required SIWE fields
    const hasUri = /URI:\s*.+/.test(decodedMessage);
    const hasVersion = /Version:\s*1/.test(decodedMessage);
    const hasChainId = /Chain ID:\s*\d+/.test(decodedMessage);
    const hasNonce = /Nonce:\s*[a-zA-Z0-9]{8,}/.test(decodedMessage);
    const hasIssuedAt = /Issued At:\s*.+/.test(decodedMessage);

    // Message should have all required fields to be a valid SIWE message
    return hasSiwePhrase && hasUri && hasVersion && hasChainId && hasNonce && hasIssuedAt;
  } catch (error) {
    console.error('Error checking if message is SIWE:', error);
    return false;
  }
}

/**
 * Converts hex string to UTF-8 string
 * @param hex - Hex string (with or without 0x prefix)
 * @returns UTF-8 decoded string
 */
function hexToUtf8(hex: string): string {
  const hexString = hex.startsWith('0x') ? hex.slice(2) : hex;
  const bytes = new Uint8Array(hexString.length / 2);

  for (let i = 0; i < hexString.length; i += 2) {
    bytes[i / 2] = parseInt(hexString.slice(i, i + 2), 16);
  }

  return new TextDecoder().decode(bytes);
}

/**
 * Parses a SIWE message and extracts its fields
 * @param message - The SIWE message (hex or plaintext)
 * @returns Parsed SIWE fields or null if not a valid SIWE message
 */
export function parseSiweMessage(message: string): SiweMessageFields | null {
  if (!isSiweMessage(message)) {
    return null;
  }

  try {
    // Decode if hex
    let decodedMessage = message;
    if (message.startsWith('0x')) {
      decodedMessage = hexToUtf8(message);
    }

    const lines = decodedMessage.split('\n');

    // Extract domain (first line before "wants you to sign in")
    const domainMatch = lines[0]?.match(/^(.+?)\s+wants you to sign in/);
    const domain = domainMatch?.[1] || '';

    // Extract address (second line)
    const address = lines[1]?.trim() || '';

    // Extract statement (optional, between address and URI)
    let statement = '';
    let fieldStartIndex = 2;

    for (let i = 2; i < lines.length; i++) {
      if (lines[i].startsWith('URI:')) {
        fieldStartIndex = i;
        break;
      }
      if (lines[i].trim() && i === 2) {
        statement = lines[i].trim();
      } else if (lines[i].trim() && i > 2) {
        statement += '\n' + lines[i].trim();
      }
    }

    // Extract structured fields
    const fields: Record<string, string> = {};
    for (let i = fieldStartIndex; i < lines.length; i++) {
      const line = lines[i];
      const colonIndex = line.indexOf(':');
      if (colonIndex > 0) {
        const key = line.slice(0, colonIndex).trim();
        const value = line.slice(colonIndex + 1).trim();
        fields[key] = value;
      }
    }

    return {
      domain,
      address,
      statement: statement || undefined,
      uri: fields['URI'] || '',
      version: fields['Version'] || '',
      chainId: parseInt(fields['Chain ID'] || '1', 10),
      nonce: fields['Nonce'] || '',
      issuedAt: fields['Issued At'] || '',
      expirationTime: fields['Expiration Time'],
      notBefore: fields['Not Before'],
      requestId: fields['Request ID'],
      resources: fields['Resources']?.split('\n').filter(r => r.trim()) || undefined,
    };
  } catch (error) {
    console.error('Error parsing SIWE message:', error);
    return null;
  }
}

/**
 * SIWE message fields interface
 */
export interface SiweMessageFields {
  domain: string;
  address: string;
  statement?: string;
  uri: string;
  version: string;
  chainId: number;
  nonce: string;
  issuedAt: string;
  expirationTime?: string;
  notBefore?: string;
  requestId?: string;
  resources?: string[];
}
