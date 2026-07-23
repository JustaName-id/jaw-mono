/**
 * SIWE (Sign-In with Ethereum, EIP-4361) detection, parsing, and cross-domain
 * origin checks. Single source of truth shared by the keys.jaw.id popup and the
 * in-app ReactUIHandler.
 * https://eips.ethereum.org/EIPS/eip-4361
 */

import { parseSiweMessage as viemParseSiweMessage } from 'viem/siwe';

/**
 * Converts a hex string (with or without 0x prefix) to UTF-8.
 */
export function hexToUtf8(hex: string): string {
  const hexString = hex.startsWith('0x') ? hex.slice(2) : hex;
  const bytes = new Uint8Array(hexString.length / 2);

  for (let i = 0; i < hexString.length; i += 2) {
    bytes[i / 2] = parseInt(hexString.slice(i, i + 2), 16);
  }

  return new TextDecoder().decode(bytes);
}

/**
 * Detects whether a message (hex or plaintext) is a valid EIP-4361 SIWE message.
 */
export function isSiweMessage(message: string): boolean {
  if (!message) return false;

  try {
    const decodedMessage = message.startsWith('0x') ? hexToUtf8(message) : message;

    // Per EIP-4361: "<domain> wants you to sign in with your Ethereum account"
    if (!decodedMessage.includes('wants you to sign in with your Ethereum account')) {
      return false;
    }

    // Required SIWE fields
    return (
      /URI:\s*.+/.test(decodedMessage) &&
      /Version:\s*1/.test(decodedMessage) &&
      /Chain ID:\s*\d+/.test(decodedMessage) &&
      /Nonce:\s*[a-zA-Z0-9]{8,}/.test(decodedMessage) &&
      /Issued At:\s*.+/.test(decodedMessage)
    );
  } catch (error) {
    console.error('Error checking if message is SIWE:', error);
    return false;
  }
}

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

const toIsoString = (d: Date | undefined): string | undefined =>
  d instanceof Date && !Number.isNaN(d.getTime()) ? d.toISOString() : undefined;

/**
 * Parses a SIWE message into its fields, or null if it isn't a valid SIWE message.
 *
 * Delegates the field extraction to viem's `parseSiweMessage`, whose grammar is
 * strictly anchored to the EIP-4361 structure: the free-text `statement` is a
 * SINGLE line (`.*`) captured between the address and the field block, and the
 * fields are matched as one ordered, contiguous run. That makes it impossible for
 * a dApp to spoof what the user sees by embedding `URI:` / `Chain ID:` lines in
 * the statement — a mistake a whole-message "first match wins" regex is prone to.
 */
export function parseSiweMessage(message: string): SiweMessageFields | null {
  if (!isSiweMessage(message)) {
    return null;
  }

  try {
    const decoded = message.startsWith('0x') ? hexToUtf8(message) : message;
    const parsed = viemParseSiweMessage(decoded);
    // Domain + address anchor the message head; without them it isn't a usable SIWE.
    if (!parsed.domain || !parsed.address) return null;

    return {
      domain: parsed.domain,
      address: parsed.address,
      statement: parsed.statement || undefined,
      uri: parsed.uri ?? '',
      version: parsed.version ?? '',
      chainId: parsed.chainId ?? 1,
      nonce: parsed.nonce ?? '',
      issuedAt: toIsoString(parsed.issuedAt) ?? '',
      expirationTime: toIsoString(parsed.expirationTime),
      notBefore: toIsoString(parsed.notBefore),
      requestId: parsed.requestId,
      resources: parsed.resources,
    };
  } catch (error) {
    console.error('Error parsing SIWE message:', error);
    return null;
  }
}

/**
 * Resolves the lowercased host from a SIWE `domain` (a bare authority) or `uri`.
 * @returns the host, or null if empty/unparseable.
 */
function parseSiweHost(value?: string | null): string | null {
  if (!value?.trim()) return null;
  try {
    return new URL(value.includes('://') ? value : `https://${value}`).host.toLowerCase() || null;
  } catch {
    return null;
  }
}

/**
 * Per EIP-4361 the SIWE `domain` must be the origin requesting the signature.
 * Returns a warning when the asserted domain/uri host differs from the origin
 * the user is actually on (cross-domain phishing), or undefined when they match
 * or cannot be compared.
 */
export function getSiweOriginWarning(
  requestOrigin: string,
  siwe: { domain?: string; uri?: string }
): string | undefined {
  const originHost = parseSiweHost(requestOrigin);
  const siweHost = parseSiweHost(siwe.domain) ?? parseSiweHost(siwe.uri);
  if (!originHost || !siweHost || originHost === siweHost) return undefined;
  return `This sign-in request is for "${siweHost}" but the requesting site is "${originHost}". This may be a phishing attempt.`;
}
