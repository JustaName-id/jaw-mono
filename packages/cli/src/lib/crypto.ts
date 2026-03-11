/**
 * E2E encryption for CLI ↔ browser communication.
 *
 * Re-exports key generation/import/export from @jaw.id/core and provides
 * encryptMessage / decryptMessage wrappers that handle base64 serialization
 * for the relay wire format.
 */

import {
  generateKeyPair,
  deriveSharedSecret,
  encrypt,
  decrypt,
  exportKeyToHexString,
  importKeyFromHexString,
} from "@jaw.id/core";

// Re-export core crypto primitives (renamed for CLI ergonomics)
export { generateKeyPair, deriveSharedSecret };
export { exportKeyToHexString as exportKeyToHex };
export { importKeyFromHexString as importKeyFromHex };

// ── Wire-format envelope (base64 strings) ───────────────────────

export interface EncryptedEnvelope {
  iv: string; // base64
  ciphertext: string; // base64
}

export async function encryptMessage(
  sharedSecret: CryptoKey,
  payload: Record<string, unknown>,
): Promise<EncryptedEnvelope> {
  const { iv, cipherText } = await encrypt(sharedSecret, JSON.stringify(payload));
  return {
    iv: bufferToBase64(iv),
    ciphertext: bufferToBase64(cipherText),
  };
}

export async function decryptMessage(
  sharedSecret: CryptoKey,
  envelope: EncryptedEnvelope,
): Promise<Record<string, unknown>> {
  const iv = base64ToBuffer(envelope.iv);
  const cipherText = base64ToBuffer(envelope.ciphertext);
  const plaintext = await decrypt(sharedSecret, { iv, cipherText });
  return JSON.parse(plaintext);
}

// ── Encoding helpers ─────────────────────────────────────────────

function bufferToBase64(buf: Uint8Array | ArrayBuffer): string {
  const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  return Buffer.from(bytes).toString("base64");
}

function base64ToBuffer(b64: string): Uint8Array {
  return new Uint8Array(Buffer.from(b64, "base64"));
}