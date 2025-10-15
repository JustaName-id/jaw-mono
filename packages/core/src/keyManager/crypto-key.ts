/**
 * Crypto Key Management for P-256 keys
 * Provides utilities for generating, storing, and managing cryptographic keys
 */

import {
  generateKeyPair as generateP256KeyPair,
  exportKeyToHexString,
  importKeyFromHexString,
} from '../utils/crypto.js';
import { createLocalStorage, type SyncStorage } from './storage.js';

export type CryptoKeyPair = {
  privateKey: CryptoKey;
  publicKey: CryptoKey;
  publicKeyHex: string; // Hex representation for easy sharing
};

// Storage constants
export const STORAGE_SCOPE = 'jaw-kms';
export const STORAGE_NAME = 'keys';
export const ACTIVE_ID_KEY = 'activeId';

/**
 * Key Manager for crypto keys
 */
export class CryptoKeyManager {
  private storage: SyncStorage;

  constructor(storage?: SyncStorage) {
    this.storage = storage ?? createLocalStorage(STORAGE_SCOPE, STORAGE_NAME);
  }

  /**
   * Generate a new P-256 key pair
   */
  async generateKeyPair(): Promise<CryptoKeyPair> {
    const keypair = await generateP256KeyPair();
    const publicKeyHex = await exportKeyToHexString('public', keypair.publicKey);
    const privateKeyHex = await exportKeyToHexString('private', keypair.privateKey);

    const cryptoKeyPair: CryptoKeyPair = {
      privateKey: keypair.privateKey,
      publicKey: keypair.publicKey,
      publicKeyHex,
    };

    // Store the key pair
    await this.storeKeyPair(publicKeyHex, privateKeyHex, publicKeyHex);
    this.storage.setItem(ACTIVE_ID_KEY, publicKeyHex);

    return cryptoKeyPair;
  }

  /**
   * Get the active key pair
   */
  async getKeyPair(): Promise<CryptoKeyPair | null> {
    const id = this.storage.getItem<string>(ACTIVE_ID_KEY);
    if (!id) return null;

    const stored = this.storage.getItem<{
      privateKey: string;
      publicKey: string;
    }>(id);
    if (!stored) return null;

    const privateKey = await importKeyFromHexString('private', stored.privateKey);
    const publicKey = await importKeyFromHexString('public', stored.publicKey);

    return {
      privateKey,
      publicKey,
      publicKeyHex: stored.publicKey,
    };
  }

  /**
   * Get or create a key pair
   */
  async getOrCreateKeyPair(): Promise<CryptoKeyPair> {
    const keypair = await this.getKeyPair();
    if (keypair) return keypair;
    return this.generateKeyPair();
  }

  /**
   * Remove the active key pair
   */
  async removeKeyPair(): Promise<void> {
    const keypair = await this.getKeyPair();
    if (!keypair) return;

    this.storage.removeItem(keypair.publicKeyHex);
    this.storage.removeItem(ACTIVE_ID_KEY);
  }

  /**
   * Clear all stored keys
   */
  clear(): void {
    // Get all keys and remove them
    const id = this.storage.getItem<string>(ACTIVE_ID_KEY);
    if (id) {
      this.storage.removeItem(id);
    }
    this.storage.removeItem(ACTIVE_ID_KEY);
  }

  /**
   * Store a key pair
   */
  private storeKeyPair(id: string, privateKeyHex: string, publicKeyHex: string): void {
    this.storage.setItem(id, {
      privateKey: privateKeyHex,
      publicKey: publicKeyHex,
    });
  }
}

/**
 * Default instance using localStorage
 */
export const defaultCryptoKeyManager = new CryptoKeyManager();

/**
 * Get or create the active key pair
 */
export async function getOrCreateKeyPair(): Promise<CryptoKeyPair> {
  return defaultCryptoKeyManager.getOrCreateKeyPair();
}

/**
 * Get the active key pair
 */
export async function getKeyPair(): Promise<CryptoKeyPair | null> {
  return defaultCryptoKeyManager.getKeyPair();
}

/**
 * Generate a new crypto key pair
 */
export async function generateCryptoKeyPair(): Promise<CryptoKeyPair> {
  return defaultCryptoKeyManager.generateKeyPair();
}

/**
 * Remove the active key pair
 */
export async function removeKeyPair(): Promise<void> {
  return defaultCryptoKeyManager.removeKeyPair();
}

