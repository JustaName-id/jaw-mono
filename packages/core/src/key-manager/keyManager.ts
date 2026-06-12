import { deriveSharedSecret, generateKeyPair, toNonExtractablePrivateKey } from '../utils/crypto.js';
import { createIndexedDBStorage, createLocalStorage, type AsyncStorage } from '../storage-manager/index.js';

const OWN_PRIVATE_KEY = 'ownPrivateKey';
const OWN_PUBLIC_KEY = 'ownPublicKey';
const PEER_PUBLIC_KEY = 'peerPublicKey';

/**
 * KeyManager handles cryptographic key management for secure communication.
 *
 * Features:
 * - Generates ECDH P-256 key pairs and derives shared secrets
 * - Persists keys as CryptoKey objects in IndexedDB. The own private key is
 *   stored non-extractable, so it can be used for derivation but its raw bytes
 *   can never be exported again (e.g. by XSS). Public keys are not secret.
 * - Manages peer public keys
 */
export class KeyManager {
    private storage: AsyncStorage;
    private ownPrivateKey: CryptoKey | null = null;
    private ownPublicKey: CryptoKey | null = null;
    private peerPublicKey: CryptoKey | null = null;
    private sharedSecret: CryptoKey | null = null;
    private loadingPromise: Promise<void> | null = null;

    constructor(storage?: AsyncStorage) {
        this.storage = storage ?? createIndexedDBStorage('jaw', 'keys');
        // Migration: older versions persisted the private key as extractable hex in
        // localStorage. Remove any such leftovers so the raw key no longer lingers there.
        try {
            const legacy = createLocalStorage('jaw', 'keys');
            legacy.removeItem(OWN_PRIVATE_KEY);
            legacy.removeItem(OWN_PUBLIC_KEY);
            legacy.removeItem(PEER_PUBLIC_KEY);
        } catch {
            /* ignore */
        }
    }

    /**
     * Get own public key (generates if not exists)
     */
    async getOwnPublicKey(): Promise<CryptoKey> {
        await this.loadKeysIfNeeded();
        if (!this.ownPublicKey) {
            throw new Error('Failed to generate or load own public key');
        }
        return this.ownPublicKey;
    }

    /**
     * Get shared secret (null if peer public key not set)
     */
    async getSharedSecret(): Promise<CryptoKey | null> {
        await this.loadKeysIfNeeded();
        return this.sharedSecret;
    }

    /**
     * Set peer's public key and derive shared secret
     */
    async setPeerPublicKey(key: CryptoKey): Promise<void> {
        this.sharedSecret = null;
        this.peerPublicKey = key;
        await this.storeKey(PEER_PUBLIC_KEY, key);
        await this.loadKeysIfNeeded();
    }

    /**
     * Clear all keys from memory and storage
     */
    async clear(): Promise<void> {
        this.ownPrivateKey = null;
        this.ownPublicKey = null;
        this.peerPublicKey = null;
        this.sharedSecret = null;
        this.loadingPromise = null;
        await this.storage.removeItem(OWN_PRIVATE_KEY);
        await this.storage.removeItem(OWN_PUBLIC_KEY);
        await this.storage.removeItem(PEER_PUBLIC_KEY);
    }

    /**
     * Generate new key pair. The private key is stored non-extractable.
     */
    private async generateKeyPair(): Promise<void> {
        const newKeyPair = await generateKeyPair();
        this.ownPublicKey = newKeyPair.publicKey;
        this.ownPrivateKey = await toNonExtractablePrivateKey(newKeyPair.privateKey);
        await this.storeKey(OWN_PRIVATE_KEY, this.ownPrivateKey);
        await this.storeKey(OWN_PUBLIC_KEY, this.ownPublicKey);
    }

    /**
     * Load keys from storage if not in memory
     * Protected against concurrent calls to prevent race conditions
     */
    private async loadKeysIfNeeded(): Promise<void> {
        if (this.loadingPromise) {
            return this.loadingPromise;
        }

        this.loadingPromise = this._loadKeysIfNeeded();

        try {
            await this.loadingPromise;
        } finally {
            this.loadingPromise = null;
        }
    }

    /**
     * Internal implementation of key loading
     */
    private async _loadKeysIfNeeded(): Promise<void> {
        // Load own keys
        if (this.ownPrivateKey === null) {
            this.ownPrivateKey = await this.loadKey(OWN_PRIVATE_KEY);
        }

        if (this.ownPublicKey === null) {
            this.ownPublicKey = await this.loadKey(OWN_PUBLIC_KEY);
        }

        // Generate if missing
        if (this.ownPrivateKey === null || this.ownPublicKey === null) {
            await this.generateKeyPair();
        }

        // Load peer key
        if (this.peerPublicKey === null) {
            this.peerPublicKey = await this.loadKey(PEER_PUBLIC_KEY);
        }

        // Derive shared secret
        if (this.sharedSecret === null) {
            if (this.ownPrivateKey === null || this.peerPublicKey === null) return;
            this.sharedSecret = await deriveSharedSecret(this.ownPrivateKey, this.peerPublicKey);
        }
    }

    /**
     * Load a CryptoKey from storage
     */
    private async loadKey(storageKey: string): Promise<CryptoKey | null> {
        return (await this.storage.getItem<CryptoKey>(storageKey)) ?? null;
    }

    /**
     * Store a CryptoKey to storage
     */
    private async storeKey(storageKey: string, key: CryptoKey): Promise<void> {
        await this.storage.setItem(storageKey, key);
    }
}
