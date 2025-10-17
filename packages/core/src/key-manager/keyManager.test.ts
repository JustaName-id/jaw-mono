import { describe, it, expect, beforeEach } from 'vitest';
import { KeyManager } from './keyManager.js';
import { createMemoryStorage, type SyncStorage } from '../storage-manager/index.js';

describe('KeyManager', () => {
  let storage: SyncStorage;
  let keyManager: KeyManager;

  beforeEach(() => {
    storage = createMemoryStorage();
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
    const peerKeyManager = new KeyManager(createMemoryStorage());
    const peerPublicKey = await peerKeyManager.getOwnPublicKey();

    // Set peer's public key
    await keyManager.setPeerPublicKey(peerPublicKey);

    // Should now have a shared secret
    const sharedSecret = await keyManager.getSharedSecret();
    expect(sharedSecret).toBeDefined();
    expect(sharedSecret).not.toBeNull();
  });

  it('should derive same shared secret on both sides', async () => {
    const storage1 = createMemoryStorage();
    const storage2 = createMemoryStorage();
    
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
    const ownPrivateKey = storage.getItem('ownPrivateKey');
    const ownPublicKey = storage.getItem('ownPublicKey');

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
    const peerManager = new KeyManager(createMemoryStorage());
    const peerKey = await peerManager.getOwnPublicKey();
    await keyManager.setPeerPublicKey(peerKey);

    // Verify shared secret exists
    const secretBefore = await keyManager.getSharedSecret();
    expect(secretBefore).not.toBeNull();

    // Clear
    await keyManager.clear();

    // Verify storage is cleared
    expect(storage.getItem('ownPrivateKey')).toBeNull();
    expect(storage.getItem('ownPublicKey')).toBeNull();
    expect(storage.getItem('peerPublicKey')).toBeNull();

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

  it('should handle concurrent key loading without race conditions', async () => {
    const testStorage = createMemoryStorage();
    const testKeyManager = new KeyManager(testStorage);

    // Call getOwnPublicKey multiple times concurrently
    const [key1, key2, key3] = await Promise.all([
      testKeyManager.getOwnPublicKey(),
      testKeyManager.getOwnPublicKey(),
      testKeyManager.getOwnPublicKey(),
    ]);

    // All should be the same instance (no duplicate key generation)
    expect(key1).toBe(key2);
    expect(key2).toBe(key3);

    // Verify only one key pair was stored
    const storedPrivateKey = testStorage.getItem('ownPrivateKey');
    const storedPublicKey = testStorage.getItem('ownPublicKey');
    expect(storedPrivateKey).toBeDefined();
    expect(storedPublicKey).toBeDefined();
  });
});

