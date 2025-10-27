/**
 * SDK Storage Layer
 * Manages localStorage persistence for ECDH encryption keys
 */

const STORAGE_KEY = 'SDK_ENCRYPTION_KEYS';
const KEY_EXPIRATION_MS = 24 * 60 * 60 * 1000; // 24 hours

export interface StoredKeyPair {
  publicKey: string; // hex format (SPKI)
  privateKey: JsonWebKey; // Exportable private key
}

export interface StoredKeys {
  ownKeyPair: StoredKeyPair | null;
  peerPublicKeys: Record<string, string>; // Map of peer hex -> their public key hex
  timestamp: number; // When keys were created
}

/**
 * Save encryption keys to localStorage
 */
export async function saveKeys(
  ownKeyPair: { publicKey: string; privateKey: JsonWebKey },
  peerPublicKeyHex: string
): Promise<void> {
  try {
    // Load existing keys (to preserve other peer keys)
    const existing = loadKeys();

    const stored: StoredKeys = {
      ownKeyPair,
      peerPublicKeys: {
        ...existing.peerPublicKeys,
        [peerPublicKeyHex]: peerPublicKeyHex, // Store peer's public key
      },
      timestamp: Date.now(),
    };

    localStorage.setItem(STORAGE_KEY, JSON.stringify(stored));
    console.log('💾 Saved encryption keys to localStorage', {
      ownPublicKey: ownKeyPair.publicKey.slice(0, 20) + '...',
      peerKey: peerPublicKeyHex.slice(0, 20) + '...',
    });
  } catch (error) {
    console.error('❌ Failed to save keys to localStorage:', error);
    throw error;
  }
}

/**
 * Load encryption keys from localStorage
 */
export function loadKeys(): StoredKeys {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);

    if (!stored) {
      console.log('📂 No stored keys found');
      return {
        ownKeyPair: null,
        peerPublicKeys: {},
        timestamp: 0,
      };
    }

    const parsed: StoredKeys = JSON.parse(stored);

    // Check if keys are expired
    const age = Date.now() - parsed.timestamp;
    if (age > KEY_EXPIRATION_MS) {
      console.log('⏰ Stored keys expired, clearing...');
      clearKeys();
      return {
        ownKeyPair: null,
        peerPublicKeys: {},
        timestamp: 0,
      };
    }

    console.log('📂 Loaded encryption keys from localStorage', {
      hasOwnKeyPair: !!parsed.ownKeyPair,
      peerKeyCount: Object.keys(parsed.peerPublicKeys).length,
      ageMinutes: Math.floor(age / 60000),
    });

    return parsed;
  } catch (error) {
    console.error('❌ Failed to load keys from localStorage:', error);
    // Return empty on error
    return {
      ownKeyPair: null,
      peerPublicKeys: {},
      timestamp: 0,
    };
  }
}

/**
 * Clear all encryption keys from localStorage
 */
export function clearKeys(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
    console.log('🗑️ Cleared all encryption keys from localStorage');
  } catch (error) {
    console.error('❌ Failed to clear keys from localStorage:', error);
  }
}

/**
 * Check if we have stored keys for a specific peer
 */
export function hasPeerKeys(peerPublicKeyHex: string): boolean {
  const stored = loadKeys();

  if (!stored.ownKeyPair) {
    return false;
  }

  const hasPeer = peerPublicKeyHex in stored.peerPublicKeys;
  console.log(`🔍 Checking for peer keys: ${hasPeer ? '✅ Found' : '❌ Not found'}`, {
    peerKey: peerPublicKeyHex.slice(0, 20) + '...',
  });

  return hasPeer;
}

/**
 * Get peer's public key from storage
 */
export function getPeerPublicKey(peerPublicKeyHex: string): string | null {
  const stored = loadKeys();
  return stored.peerPublicKeys[peerPublicKeyHex] || null;
}

/**
 * Get own key pair from storage
 */
export function getOwnKeyPair(): StoredKeyPair | null {
  const stored = loadKeys();
  return stored.ownKeyPair;
}

/**
 * Remove a specific peer's keys
 */
export function removePeerKey(peerPublicKeyHex: string): void {
  try {
    const stored = loadKeys();

    if (peerPublicKeyHex in stored.peerPublicKeys) {
      delete stored.peerPublicKeys[peerPublicKeyHex];
      localStorage.setItem(STORAGE_KEY, JSON.stringify(stored));
      console.log('🗑️ Removed peer key from storage', {
        peerKey: peerPublicKeyHex.slice(0, 20) + '...',
      });
    }
  } catch (error) {
    console.error('❌ Failed to remove peer key:', error);
  }
}
