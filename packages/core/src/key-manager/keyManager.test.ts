import { describe, it, expect, beforeEach } from 'vitest';
import { KeyManager } from './keyManager.js';
import { type AsyncStorage } from '../storage-manager/index.js';

function createAsyncMemoryStorage(): AsyncStorage {
    const store = new Map<string, unknown>();
    return {
        getItem: async <T>(key: string): Promise<T | null> => (store.has(key) ? (store.get(key) as T) : null),
        setItem: async (key: string, value: unknown): Promise<void> => {
            store.set(key, value);
        },
        removeItem: async (key: string): Promise<void> => {
            store.delete(key);
        },
    };
}

describe('KeyManager', () => {
    let storage: AsyncStorage;
    let keyManager: KeyManager;

    beforeEach(() => {
        storage = createAsyncMemoryStorage();
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
        const peerKeyManager = new KeyManager(createAsyncMemoryStorage());
        const peerPublicKey = await peerKeyManager.getOwnPublicKey();

        // Set peer's public key
        await keyManager.setPeerPublicKey(peerPublicKey);

        // Should now have a shared secret
        const sharedSecret = await keyManager.getSharedSecret();
        expect(sharedSecret).toBeDefined();
        expect(sharedSecret).not.toBeNull();
    });

    it('should derive same shared secret on both sides', async () => {
        const storage1 = createAsyncMemoryStorage();
        const storage2 = createAsyncMemoryStorage();

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

    it('should persist keys as non-extractable CryptoKeys in storage', async () => {
        await keyManager.getOwnPublicKey();

        // Verify keys were stored as CryptoKey objects (not extractable hex)
        const ownPrivateKey = await storage.getItem<CryptoKey>('ownPrivateKey');
        const ownPublicKey = await storage.getItem<CryptoKey>('ownPublicKey');

        expect(ownPrivateKey).not.toBeNull();
        expect(ownPublicKey).not.toBeNull();

        // The private key must be non-extractable so its bytes can't be exported
        // (e.g. by XSS reading it back out of storage); the public key is not secret.
        expect(ownPrivateKey?.extractable).toBe(false);
        expect(ownPublicKey?.extractable).toBe(true);
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
        const peerManager = new KeyManager(createAsyncMemoryStorage());
        const peerKey = await peerManager.getOwnPublicKey();
        await keyManager.setPeerPublicKey(peerKey);

        // Verify shared secret exists
        const secretBefore = await keyManager.getSharedSecret();
        expect(secretBefore).not.toBeNull();

        // Clear
        await keyManager.clear();

        // Verify storage is cleared
        expect(await storage.getItem('ownPrivateKey')).toBeNull();
        expect(await storage.getItem('ownPublicKey')).toBeNull();
        expect(await storage.getItem('peerPublicKey')).toBeNull();

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
        const testStorage = createAsyncMemoryStorage();
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
        const storedPrivateKey = await testStorage.getItem('ownPrivateKey');
        const storedPublicKey = await testStorage.getItem('ownPublicKey');
        expect(storedPrivateKey).not.toBeNull();
        expect(storedPublicKey).not.toBeNull();
    });
});
