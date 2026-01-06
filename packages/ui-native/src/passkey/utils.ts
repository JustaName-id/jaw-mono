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
