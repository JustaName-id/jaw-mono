/**
 * Passkey Utilities
 *
 * Conversion utilities between ArrayBuffer (viem) and Base64URL (react-native-passkeys)
 */

/**
 * Converts an ArrayBuffer to a Base64URL-encoded string
 * @param buffer - The ArrayBuffer to convert
 * @returns Base64URL-encoded string
 */
export function arrayBufferToBase64URL(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  // Convert to base64
  const base64 =
    typeof btoa !== 'undefined'
      ? btoa(binary)
      : Buffer.from(binary, 'binary').toString('base64');

  // Convert to base64url (replace + with -, / with _, and remove =)
  return base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/**
 * Converts a Base64URL-encoded string to an ArrayBuffer
 * @param base64url - The Base64URL-encoded string to convert
 * @returns ArrayBuffer
 */
export function base64URLToArrayBuffer(base64url: string): ArrayBuffer {
  // Convert from base64url to base64
  let base64 = base64url.replace(/-/g, '+').replace(/_/g, '/');

  // Add padding if needed
  while (base64.length % 4 !== 0) {
    base64 += '=';
  }

  // Decode base64
  const binary =
    typeof atob !== 'undefined'
      ? atob(base64)
      : Buffer.from(base64, 'base64').toString('binary');

  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }

  return bytes.buffer;
}

/**
 * Converts a string to an ArrayBuffer
 * @param str - The string to convert
 * @returns ArrayBuffer
 */
export function stringToArrayBuffer(str: string): ArrayBuffer {
  const encoder = new TextEncoder();
  return encoder.encode(str).buffer;
}

/**
 * Converts an ArrayBuffer to a hex string
 * @param buffer - The ArrayBuffer to convert
 * @returns Hex string with 0x prefix
 */
export function arrayBufferToHex(buffer: ArrayBuffer): `0x${string}` {
  const bytes = new Uint8Array(buffer);
  let hex = '0x';
  for (let i = 0; i < bytes.byteLength; i++) {
    hex += bytes[i].toString(16).padStart(2, '0');
  }
  return hex as `0x${string}`;
}

/**
 * Converts a hex string to an ArrayBuffer
 * @param hex - The hex string (with or without 0x prefix)
 * @returns ArrayBuffer
 */
export function hexToArrayBuffer(hex: string): ArrayBuffer {
  const cleanHex = hex.startsWith('0x') ? hex.slice(2) : hex;
  const bytes = new Uint8Array(cleanHex.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(cleanHex.substr(i * 2, 2), 16);
  }
  return bytes.buffer;
}

/**
 * Generates a random challenge as ArrayBuffer
 * @param length - Length in bytes (default: 32)
 * @returns ArrayBuffer containing random bytes
 */
export function generateChallenge(length: number = 32): ArrayBuffer {
  const array = new Uint8Array(length);
  crypto.getRandomValues(array);
  return array.buffer;
}

/**
 * Validates a Base64URL string
 * @param str - String to validate
 * @returns boolean indicating if the string is valid Base64URL
 */
export function isValidBase64URL(str: string): boolean {
  return /^[A-Za-z0-9_-]*$/.test(str);
}

/**
 * Minimal CBOR decoder for parsing WebAuthn attestation objects
 * Only supports the subset of CBOR needed for WebAuthn (maps, byte strings, text strings, integers)
 */
class CborDecoder {
  private data: Uint8Array;
  private offset: number = 0;

  constructor(data: ArrayBuffer) {
    this.data = new Uint8Array(data);
  }

  decode(): unknown {
    const initialByte = this.data[this.offset++];
    const majorType = initialByte >> 5;
    const additionalInfo = initialByte & 0x1f;

    switch (majorType) {
      case 0: // Unsigned integer
        return this.decodeUnsignedInteger(additionalInfo);
      case 1: // Negative integer
        return -1 - Number(this.decodeUnsignedInteger(additionalInfo));
      case 2: // Byte string
        return this.decodeByteString(additionalInfo);
      case 3: // Text string
        return this.decodeTextString(additionalInfo);
      case 4: // Array
        return this.decodeArray(additionalInfo);
      case 5: // Map
        return this.decodeMap(additionalInfo);
      default:
        throw new Error(`Unsupported CBOR major type: ${majorType}`);
    }
  }

  private decodeUnsignedInteger(additionalInfo: number): number | bigint {
    if (additionalInfo < 24) {
      return additionalInfo;
    } else if (additionalInfo === 24) {
      return this.data[this.offset++];
    } else if (additionalInfo === 25) {
      const value = (this.data[this.offset] << 8) | this.data[this.offset + 1];
      this.offset += 2;
      return value;
    } else if (additionalInfo === 26) {
      const value =
        (this.data[this.offset] << 24) |
        (this.data[this.offset + 1] << 16) |
        (this.data[this.offset + 2] << 8) |
        this.data[this.offset + 3];
      this.offset += 4;
      return value >>> 0; // Ensure unsigned
    } else if (additionalInfo === 27) {
      // 64-bit - use BigInt
      const high =
        (BigInt(this.data[this.offset]) << 24n) |
        (BigInt(this.data[this.offset + 1]) << 16n) |
        (BigInt(this.data[this.offset + 2]) << 8n) |
        BigInt(this.data[this.offset + 3]);
      const low =
        (BigInt(this.data[this.offset + 4]) << 24n) |
        (BigInt(this.data[this.offset + 5]) << 16n) |
        (BigInt(this.data[this.offset + 6]) << 8n) |
        BigInt(this.data[this.offset + 7]);
      this.offset += 8;
      return (high << 32n) | low;
    }
    throw new Error(`Invalid additional info for integer: ${additionalInfo}`);
  }

  private decodeByteString(additionalInfo: number): Uint8Array {
    const length = Number(this.decodeUnsignedInteger(additionalInfo));
    const value = this.data.slice(this.offset, this.offset + length);
    this.offset += length;
    return value;
  }

  private decodeTextString(additionalInfo: number): string {
    const length = Number(this.decodeUnsignedInteger(additionalInfo));
    const bytes = this.data.slice(this.offset, this.offset + length);
    this.offset += length;
    return new TextDecoder().decode(bytes);
  }

  private decodeArray(additionalInfo: number): unknown[] {
    const length = Number(this.decodeUnsignedInteger(additionalInfo));
    const array: unknown[] = [];
    for (let i = 0; i < length; i++) {
      array.push(this.decode());
    }
    return array;
  }

  private decodeMap(additionalInfo: number): Map<unknown, unknown> {
    const length = Number(this.decodeUnsignedInteger(additionalInfo));
    const map = new Map<unknown, unknown>();
    for (let i = 0; i < length; i++) {
      const key = this.decode();
      const value = this.decode();
      map.set(key, value);
    }
    return map;
  }
}

/**
 * Parse CBOR-encoded data
 */
export function parseCbor(data: ArrayBuffer): unknown {
  return new CborDecoder(data).decode();
}

/**
 * Parse authenticator data to extract the credential public key
 * @param authData - The authenticator data from the attestation
 * @returns The COSE-encoded public key as Uint8Array, or null if not present
 */
export function parseAuthenticatorData(authData: Uint8Array): {
  rpIdHash: Uint8Array;
  flags: number;
  signCount: number;
  aaguid?: Uint8Array;
  credentialId?: Uint8Array;
  credentialPublicKey?: Uint8Array;
} {
  let offset = 0;

  // rpIdHash (32 bytes)
  const rpIdHash = authData.slice(offset, offset + 32);
  offset += 32;

  // flags (1 byte)
  const flags = authData[offset++];

  // signCount (4 bytes, big-endian)
  const signCount =
    (authData[offset] << 24) |
    (authData[offset + 1] << 16) |
    (authData[offset + 2] << 8) |
    authData[offset + 3];
  offset += 4;

  const result: ReturnType<typeof parseAuthenticatorData> = {
    rpIdHash,
    flags,
    signCount,
  };

  // Check AT flag (bit 6) for attested credential data
  const hasAttestedCredentialData = (flags & 0x40) !== 0;

  if (hasAttestedCredentialData) {
    // aaguid (16 bytes)
    result.aaguid = authData.slice(offset, offset + 16);
    offset += 16;

    // credentialIdLength (2 bytes, big-endian)
    const credentialIdLength = (authData[offset] << 8) | authData[offset + 1];
    offset += 2;

    // credentialId (variable length)
    result.credentialId = authData.slice(offset, offset + credentialIdLength);
    offset += credentialIdLength;

    // credentialPublicKey (COSE format, remaining bytes minus any extensions)
    // For simplicity, we take the rest. In practice, extensions could follow.
    result.credentialPublicKey = authData.slice(offset);
  }

  return result;
}

/**
 * Extract the uncompressed P-256 public key from a COSE key
 * @param coseKey - COSE-encoded public key (from credentialPublicKey)
 * @returns 65-byte uncompressed public key (0x04 || x || y) or null if invalid
 */
export function extractP256PublicKeyFromCose(coseKey: Uint8Array): Uint8Array | null {
  try {
    const decoded = parseCbor(coseKey.buffer) as Map<number, unknown>;

    if (!(decoded instanceof Map)) {
      return null;
    }

    // COSE EC2 key structure:
    // 1: kty (key type) = 2 (EC2)
    // 3: alg (algorithm) = -7 (ES256)
    // -1: crv (curve) = 1 (P-256)
    // -2: x coordinate (32 bytes)
    // -3: y coordinate (32 bytes)

    const kty = decoded.get(1);
    if (kty !== 2) {
      return null; // Not an EC2 key
    }

    const x = decoded.get(-2) as Uint8Array;
    const y = decoded.get(-3) as Uint8Array;

    if (!x || !y || x.length !== 32 || y.length !== 32) {
      return null;
    }

    // Create uncompressed public key: 0x04 || x || y
    const publicKey = new Uint8Array(65);
    publicKey[0] = 0x04;
    publicKey.set(x, 1);
    publicKey.set(y, 33);

    return publicKey;
  } catch {
    return null;
  }
}

/**
 * SPKI header for P-256 EC public keys
 * This is the fixed ASN.1 DER encoding for:
 * SEQUENCE {
 *   SEQUENCE {
 *     OBJECT IDENTIFIER 1.2.840.10045.2.1 (id-ecPublicKey)
 *     OBJECT IDENTIFIER 1.2.840.10045.3.1.7 (prime256v1/secp256r1)
 *   }
 *   BIT STRING (placeholder for public key)
 * }
 */
const SPKI_P256_HEADER = new Uint8Array([
  0x30, 0x59, // SEQUENCE, 89 bytes
  0x30, 0x13, // SEQUENCE, 19 bytes (algorithm identifier)
  0x06, 0x07, // OID, 7 bytes
  0x2a, 0x86, 0x48, 0xce, 0x3d, 0x02, 0x01, // 1.2.840.10045.2.1 (id-ecPublicKey)
  0x06, 0x08, // OID, 8 bytes
  0x2a, 0x86, 0x48, 0xce, 0x3d, 0x03, 0x01, 0x07, // 1.2.840.10045.3.1.7 (prime256v1)
  0x03, 0x42, // BIT STRING, 66 bytes
  0x00, // unused bits = 0
]);

/**
 * Convert a raw P-256 public key to SPKI (SubjectPublicKeyInfo) DER format
 * @param rawPublicKey - 65-byte uncompressed public key (0x04 || x || y)
 * @returns SPKI-formatted public key as Uint8Array, or null if invalid
 */
export function rawP256ToSpki(rawPublicKey: Uint8Array): Uint8Array | null {
  if (rawPublicKey.length !== 65 || rawPublicKey[0] !== 0x04) {
    return null;
  }

  // SPKI = header (26 bytes) + raw public key (65 bytes) = 91 bytes
  const spki = new Uint8Array(SPKI_P256_HEADER.length + rawPublicKey.length);
  spki.set(SPKI_P256_HEADER, 0);
  spki.set(rawPublicKey, SPKI_P256_HEADER.length);

  return spki;
}

/**
 * Extract the public key from a WebAuthn attestation object
 * @param attestationObject - Base64URL encoded attestation object or ArrayBuffer
 * @param asSpki - If true, returns SPKI format (for react-native-quick-crypto); otherwise raw format
 * @returns The public key as ArrayBuffer, or null if extraction fails
 */
export function extractPublicKeyFromAttestation(
  attestationObject: string | ArrayBuffer,
  asSpki: boolean = false
): ArrayBuffer | null {
  try {
    const attestationBuffer =
      typeof attestationObject === 'string'
        ? base64URLToArrayBuffer(attestationObject)
        : attestationObject;

    const decoded = parseCbor(attestationBuffer) as Map<string, unknown>;

    if (!(decoded instanceof Map)) {
      return null;
    }

    const authData = decoded.get('authData') as Uint8Array;
    if (!authData) {
      return null;
    }

    const parsed = parseAuthenticatorData(authData);
    if (!parsed.credentialPublicKey) {
      return null;
    }

    const rawPublicKey = extractP256PublicKeyFromCose(parsed.credentialPublicKey);
    if (!rawPublicKey) {
      return null;
    }

    // Convert to SPKI format if requested (needed for react-native-quick-crypto)
    if (asSpki) {
      const spkiKey = rawP256ToSpki(rawPublicKey);
      return spkiKey ? spkiKey.buffer : null;
    }

    return rawPublicKey.buffer;
  } catch (error) {
    console.error('Failed to extract public key from attestation:', error);
    return null;
  }
}
