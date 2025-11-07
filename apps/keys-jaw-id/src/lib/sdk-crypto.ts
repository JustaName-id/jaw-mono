/**
 * Cryptography utilities for Coinbase SDK communication
 * Implements ECDH P-256 key exchange and AES-GCM encryption
 */

import {
  saveKeys,
  clearKeys as clearStorageKeys,
  hasPeerKeys as hasStoredPeerKeys,
  getOwnKeyPair as getStoredOwnKeyPair,
} from './sdk-storage';

export interface KeyManager {
  ownKeyPair: CryptoKeyPair | null;
  peerPublicKey: CryptoKey | null;
  sharedSecret: CryptoKey | null;
}

export interface EncryptedData {
  iv: Uint8Array<ArrayBuffer>;
  cipherText: ArrayBuffer;
}

/**
 * Generate an ECDH P-256 key pair for key exchange
 */
export async function generateKeyPair(): Promise<CryptoKeyPair> {
  return crypto.subtle.generateKey(
    {
      name: 'ECDH',
      namedCurve: 'P-256',
    },
    true, // extractable
    ['deriveKey']
  );
}

/**
 * Import a peer's public key from hex string (SPKI format)
 * The hex string should be the P-256 public key in SPKI format (~176 chars with 0x prefix)
 */
export async function importPublicKey(hexString: string): Promise<CryptoKey> {
  // Remove '0x' prefix if present
  const cleanHex = hexString.startsWith('0x') ? hexString.slice(2) : hexString;

  // Convert hex to Uint8Array
  const bytes = new Uint8Array(
    cleanHex.match(/.{1,2}/g)!.map(byte => parseInt(byte, 16))
  );

  return crypto.subtle.importKey(
    'spki', // Public key format
    bytes.buffer,
    {
      name: 'ECDH',
      namedCurve: 'P-256',
    },
    true,
    [] // Public keys have no usages
  );
}

/**
 * Export your public key to hex string (SPKI format)
 */
export async function exportPublicKey(key: CryptoKey): Promise<string> {
  const exported = await crypto.subtle.exportKey('spki', key);
  const bytes = new Uint8Array(exported);
  return '0x' + Array.from(bytes)
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

/**
 * Derive a shared AES-GCM secret from your private key and peer's public key
 */
export async function deriveSharedSecret(
  ownPrivateKey: CryptoKey,
  peerPublicKey: CryptoKey
): Promise<CryptoKey> {
  return crypto.subtle.deriveKey(
    {
      name: 'ECDH',
      public: peerPublicKey,
    },
    ownPrivateKey,
    {
      name: 'AES-GCM',
      length: 256,
    },
    false, // not extractable for security
    ['encrypt', 'decrypt']
  );
}

/**
 * Encrypt data with AES-GCM using the shared secret
 */
export async function encrypt(
  plaintext: object,
  sharedSecret: CryptoKey
): Promise<EncryptedData> {
  const iv = crypto.getRandomValues(new Uint8Array(12)); // 12 bytes for AES-GCM
  const serialized = JSON.stringify(plaintext);
  const encoded = new TextEncoder().encode(serialized);

  const cipherText = await crypto.subtle.encrypt(
    {
      name: 'AES-GCM',
      iv,
    },
    sharedSecret,
    encoded
  );

  return { iv, cipherText };
}

/**
 * Decrypt data with AES-GCM using the shared secret
 */
export async function decrypt(
  encrypted: EncryptedData,
  sharedSecret: CryptoKey
): Promise<any> {
  const decrypted = await crypto.subtle.decrypt(
    {
      name: 'AES-GCM',
      iv: encrypted.iv,
    },
    sharedSecret,
    encrypted.cipherText
  );

  const decoded = new TextDecoder().decode(decrypted);
  return JSON.parse(decoded);
}

/**
 * Round-trip test to verify encryption/decryption works
 * Useful for debugging
 */
export async function testEncryption(
  data: object,
  sharedSecret: CryptoKey
): Promise<boolean> {
  try {
    const encrypted = await encrypt(data, sharedSecret);
    const decrypted = await decrypt(encrypted, sharedSecret);
    return JSON.stringify(data) === JSON.stringify(decrypted);
  } catch (error) {
    console.error('❌ Encryption test failed:', error);
    return false;
  }
}

// ============================================================================
// LocalStorage Integration Functions
// ============================================================================

/**
 * Export private key to JsonWebKey format for storage
 */
async function exportPrivateKey(key: CryptoKey): Promise<JsonWebKey> {
  return await crypto.subtle.exportKey('jwk', key);
}

/**
 * Import private key from JsonWebKey format
 */
async function importPrivateKey(jwk: JsonWebKey): Promise<CryptoKey> {
  return await crypto.subtle.importKey(
    'jwk',
    jwk,
    {
      name: 'ECDH',
      namedCurve: 'P-256',
    },
    true,
    ['deriveKey']
  );
}

/**
 * Save key pair and peer public key to localStorage
 */
export async function saveKeysToStorage(
  ownKeyPair: CryptoKeyPair,
  peerPublicKeyHex: string
): Promise<void> {
  try {
    const publicKeyHex = await exportPublicKey(ownKeyPair.publicKey);
    const privateKeyJwk = await exportPrivateKey(ownKeyPair.privateKey);

    await saveKeys(
      {
        publicKey: publicKeyHex,
        privateKey: privateKeyJwk,
      },
      peerPublicKeyHex
    );

    console.log('💾 Keys saved to storage successfully');
  } catch (error) {
    console.error('❌ Failed to save keys to storage:', error);
    throw error;
  }
}

/**
 * Restore shared secret from localStorage using sender's public key
 * Returns null if keys not found or expired
 */
export async function restoreSharedSecret(
  senderPublicKeyHex: string
): Promise<CryptoKey | null> {
  try {
    console.log('🔄 Attempting to restore shared secret from storage...', {
      sender: senderPublicKeyHex.slice(0, 20) + '...',
    });

    // Check if we have keys for this peer
    if (!hasStoredPeerKeys(senderPublicKeyHex)) {
      console.log('❌ No keys found for this peer');
      return null;
    }

    // Load own key pair from storage
    const storedKeyPair = getStoredOwnKeyPair();
    if (!storedKeyPair) {
      console.log('❌ No own key pair found in storage');
      return null;
    }

    // Import own private key
    const ownPrivateKey = await importPrivateKey(storedKeyPair.privateKey);

    // Import peer's public key
    const peerPublicKey = await importPublicKey(senderPublicKeyHex);

    // Derive shared secret
    const sharedSecret = await deriveSharedSecret(ownPrivateKey, peerPublicKey);

    console.log('✅ Shared secret restored successfully');
    return sharedSecret;
  } catch (error) {
    console.error('❌ Failed to restore shared secret:', error);
    return null;
  }
}

/**
 * Get own public key from localStorage
 * Returns null if not found
 */
export async function getOwnPublicKeyFromStorage(): Promise<string | null> {
  try {
    const storedKeyPair = getStoredOwnKeyPair();
    if (!storedKeyPair) {
      return null;
    }
    return storedKeyPair.publicKey;
  } catch (error) {
    console.error('❌ Failed to get own public key from storage:', error);
    return null;
  }
}

/**
 * Clear all stored encryption keys
 * Called when starting a new handshake
 */
export async function clearStoredKeys(): Promise<void> {
  console.log('🗑️ Clearing all stored encryption keys');
  clearStorageKeys();
}

/**
 * Check if we have stored keys for a specific peer
 */
export function hasPeerKeys(peerPublicKeyHex: string): boolean {
  return hasStoredPeerKeys(peerPublicKeyHex);
}
