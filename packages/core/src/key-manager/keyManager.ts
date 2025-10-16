import {
    deriveSharedSecret,
    exportKeyToHexString,
    generateKeyPair,
    importKeyFromHexString,
} from '../utils/crypto.js';

/**
 * Storage interface for key persistence
 */
export interface KeyStorage {
    get(key: string): string | null;
    set(key: string, value: string | null): void;
    clear(): void;
}

/**
 * Default localStorage-based implementation
 */
export class LocalKeyStorage implements KeyStorage {
    private readonly prefix: string;

    constructor(prefix = 'jaw-keys') {
        this.prefix = prefix;
    }

    get(key: string): string | null {
        return localStorage.getItem(`${this.prefix}:${key}`);
    }

    set(key: string, value: string | null): void {
        if (value === null) {
            localStorage.removeItem(`${this.prefix}:${key}`);
        } else {
            localStorage.setItem(`${this.prefix}:${key}`, value);
        }
    }

    clear(): void {
        const keys = Object.keys(localStorage);
        for (const key of keys) {
            if (key.startsWith(`${this.prefix}:`)) {
                localStorage.removeItem(key);
            }
        }
    }
}

interface StorageItem {
    storageKey: string;
    keyType: 'public' | 'private';
}

const OWN_PRIVATE_KEY: StorageItem = {
    storageKey: 'ownPrivateKey',
    keyType: 'private',
} as const;

const OWN_PUBLIC_KEY: StorageItem = {
    storageKey: 'ownPublicKey',
    keyType: 'public',
} as const;

const PEER_PUBLIC_KEY: StorageItem = {
    storageKey: 'peerPublicKey',
    keyType: 'public',
} as const;

/**
 * KeyManager handles cryptographic key management for secure communication
 * 
 * Features:
 * - Generates and stores ECDH P-256 key pairs
 * - Derives shared secrets for encrypted communication
 * - Persists keys using configurable storage
 * - Manages peer public keys
 */
export class KeyManager {
    private storage: KeyStorage;
    private ownPrivateKey: CryptoKey | null = null;
    private ownPublicKey: CryptoKey | null = null;
    private peerPublicKey: CryptoKey | null = null;
    private sharedSecret: CryptoKey | null = null;
    private loadingPromise: Promise<void> | null = null;

    constructor(storage?: KeyStorage) {
        this.storage = storage ?? new LocalKeyStorage();
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
        this.storage.clear();
    }

    /**
     * Generate new key pair
     */
    private async generateKeyPair(): Promise<void> {
        const newKeyPair = await generateKeyPair();
        this.ownPrivateKey = newKeyPair.privateKey;
        this.ownPublicKey = newKeyPair.publicKey;
        await this.storeKey(OWN_PRIVATE_KEY, newKeyPair.privateKey);
        await this.storeKey(OWN_PUBLIC_KEY, newKeyPair.publicKey);
    }

    /**
     * Load keys from storage if not in memory
     * Protected against concurrent calls to prevent race conditions
     */
    private async loadKeysIfNeeded(): Promise<void> {
        // If already loading, wait for that operation to complete
        if (this.loadingPromise) {
            return this.loadingPromise;
        }

        // Start loading operation
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
     * Load key from storage
     */
    private async loadKey(item: StorageItem): Promise<CryptoKey | null> {
        const key = this.storage.get(item.storageKey);
        if (!key) return null;

        try {
            return await importKeyFromHexString(item.keyType, key);
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            throw new Error(`Failed to load ${item.keyType} key '${item.storageKey}' from storage: ${message}`);
        }
    }

    /**
     * Store key to storage
     */
    private async storeKey(item: StorageItem, key: CryptoKey): Promise<void> {
        const hexString = await exportKeyToHexString(item.keyType, key);
        this.storage.set(item.storageKey, hexString);
    }
}