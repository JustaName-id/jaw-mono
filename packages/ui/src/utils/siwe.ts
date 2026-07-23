/**
 * SIWE (Sign-In with Ethereum, EIP-4361) detection, parsing, and cross-domain
 * origin checks. Single source of truth shared by the keys.jaw.id popup and the
 * in-app ReactUIHandler.
 * https://eips.ethereum.org/EIPS/eip-4361
 */

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

/**
 * Parses a SIWE message into its fields, or null if it isn't a valid SIWE message.
 */
export function parseSiweMessage(message: string): SiweMessageFields | null {
  if (!isSiweMessage(message)) {
    return null;
  }

  try {
    const decoded = message.startsWith('0x') ? hexToUtf8(message) : message;
    // Regex extraction over the whole message (not line-split) so a payload whose
    // newlines were collapsed to spaces — as some transports/inputs do — still
    // parses. EIP-4361 fields are single-token, so this stays unambiguous. Keeping
    // this consistent with isSiweMessage (also newline-agnostic) avoids the split
    // where the message validates as SIWE but its fields come back empty.
    const first = (re: RegExp): string | undefined => decoded.match(re)?.[1]?.trim();

    const domain = first(/^\s*(.+?)\s+wants you to sign in with your Ethereum account/) || '';
    const address = first(/Ethereum account:\s*(0x[a-fA-F0-9]{40})/) || '';
    const uri = first(/URI:\s*(\S+)/) || '';
    const version = first(/Version:\s*(\d+)/) || '';
    const chainId = parseInt(first(/Chain ID:\s*(\d+)/) || '1', 10);
    const nonce = first(/Nonce:\s*([a-zA-Z0-9]+)/) || '';
    const issuedAt = first(/Issued At:\s*(\S+)/) || '';

    // Statement (optional): the line(s) between the address and the URI field.
    // Newline-delimited per spec; best-effort, so a whitespace-collapsed message
    // simply yields no statement rather than mis-slicing the fields above.
    let statement: string | undefined;
    const lines = decoded.split('\n');
    if (lines.length > 2) {
      const uriIdx = lines.findIndex((l) => l.startsWith('URI:'));
      if (uriIdx > 2) {
        statement =
          lines
            .slice(2, uriIdx)
            .map((l) => l.trim())
            .filter(Boolean)
            .join('\n') || undefined;
      }
    }

    return {
      domain,
      address,
      statement,
      uri,
      version,
      chainId,
      nonce,
      issuedAt,
      expirationTime: first(/Expiration Time:\s*(\S+)/),
      notBefore: first(/Not Before:\s*(\S+)/),
      requestId: first(/Request ID:\s*(\S+)/),
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
