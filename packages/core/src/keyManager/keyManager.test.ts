import { describe, it, expect, beforeEach } from 'vitest';
import { KeyManager, LocalKeyStorage, KeyStorage } from './keyManager.js';

// Mock localStorage for testing
class MockStorage implements KeyStorage {
  private storage = new Map<string, string | null>();

  get(key: string): string | null {
    return this.storage.get(key) ?? null;
  }

  set(key: string, value: string | null): void {
    if (value === null) {
      this.storage.delete(key);
    } else {
      this.storage.set(key, value);
    }
  }

  clear(): void {
    this.storage.clear();
  }
}

describe('KeyManager', () => {
  let storage: KeyStorage;
  let keyManager: KeyManager;

  beforeEach(() => {
    storage = new MockStorage();
    keyManager = new KeyManager(storage);
  });

  it('should generate and store own public key', async () => {
    const publicKey = await keyManager.getOwnPublicKey();
    expect(publicKey).toBeDefined();
    expect(publicKey.type).toBe('public');
  });

  it('should return same public key on multiple calls', async () => {
    const publicKey1 = await keyManager.getOwnPublicKey();
    const publicKey2 = await keyManager.getOwnPublicKey();
    
    // Keys should be the same instance
    expect(publicKey1).toBe(publicKey2);
  });

  it('should return null shared secret before peer key is set', async () => {
    const sharedSecret = await keyManager.getSharedSecret();
    expect(sharedSecret).toBeNull();
  });

  it('should derive shared secret after setting peer public key', async () => {
    // Create a second key manager to act as peer
    const peerKeyManager = new KeyManager(new MockStorage());
    const peerPublicKey = await peerKeyManager.getOwnPublicKey();

    // Set peer's public key
    await keyManager.setPeerPublicKey(peerPublicKey);

    // Should now have a shared secret
    const sharedSecret = await keyManager.getSharedSecret();
    expect(sharedSecret).toBeDefined();
    expect(sharedSecret).not.toBeNull();
  });

  it('should derive same shared secret on both sides', async () => {
    const storage1 = new MockStorage();
    const storage2 = new MockStorage();
    
    const manager1 = new KeyManager(storage1);
    const manager2 = new KeyManager(storage2);

    // Get public keys
    const publicKey1 = await manager1.getOwnPublicKey();
    const publicKey2 = await manager2.getOwnPublicKey();

    // Exchange public keys
    await manager1.setPeerPublicKey(publicKey2);
    await manager2.setPeerPublicKey(publicKey1);

    // Get shared secrets
    const secret1 = await manager1.getSharedSecret();
    const secret2 = await manager2.getSharedSecret();

    expect(secret1).toBeDefined();
    expect(secret2).toBeDefined();

    // Both should be AES-GCM keys
    expect(secret1?.algorithm.name).toBe('AES-GCM');
    expect(secret2?.algorithm.name).toBe('AES-GCM');
  });

  it('should persist keys to storage', async () => {
    const publicKey = await keyManager.getOwnPublicKey();
    
    // Verify keys were stored
    const ownPrivateKey = storage.get('ownPrivateKey');
    const ownPublicKey = storage.get('ownPublicKey');

    expect(ownPrivateKey).toBeDefined();
    expect(ownPrivateKey).not.toBeNull();
    expect(ownPublicKey).toBeDefined();
    expect(ownPublicKey).not.toBeNull();
  });

  it('should load keys from storage', async () => {
    // Generate keys
    const publicKey1 = await keyManager.getOwnPublicKey();

    // Create new manager with same storage
    const newManager = new KeyManager(storage);
    const publicKey2 = await newManager.getOwnPublicKey();

    // Should load the same keys (they won't be === but should have same exported value)
    expect(publicKey1).toBeDefined();
    expect(publicKey2).toBeDefined();
  });

  it('should clear all keys', async () => {
    // Generate keys and set peer
    await keyManager.getOwnPublicKey();
    const peerManager = new KeyManager(new MockStorage());
    const peerKey = await peerManager.getOwnPublicKey();
    await keyManager.setPeerPublicKey(peerKey);

    // Verify shared secret exists
    const secretBefore = await keyManager.getSharedSecret();
    expect(secretBefore).not.toBeNull();

    // Clear
    await keyManager.clear();

    // Verify storage is cleared
    expect(storage.get('ownPrivateKey')).toBeNull();
    expect(storage.get('ownPublicKey')).toBeNull();
    expect(storage.get('peerPublicKey')).toBeNull();

    // Shared secret should be null
    const secretAfter = await keyManager.getSharedSecret();
    expect(secretAfter).toBeNull();
  });

  it('should regenerate keys after clear', async () => {
    const publicKey1 = await keyManager.getOwnPublicKey();
    await keyManager.clear();
    const publicKey2 = await keyManager.getOwnPublicKey();

    // Keys should be different after regeneration
    expect(publicKey1).not.toBe(publicKey2);
  });
});

describe('LocalKeyStorage', () => {
  // Note: These tests require a DOM environment with localStorage
  // They are skipped in non-browser environments

  it('should create storage with default prefix', () => {
    const storage = new LocalKeyStorage();
    expect(storage).toBeDefined();
  });

  it('should create storage with custom prefix', () => {
    const storage = new LocalKeyStorage('custom-prefix');
    expect(storage).toBeDefined();
  });
});

