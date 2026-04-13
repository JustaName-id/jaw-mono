import * as crypto from 'node:crypto';
import * as fs from 'node:fs';
import { PATHS } from './paths.js';
import { ensureDir } from './config.js';

interface KeystoreFile {
  version: 2;
  privateKey: string;
  address: string;
  createdAt: string;
}

/**
 * Generate a random secp256k1 private key as 0x-prefixed hex.
 */
export function generateSessionKey(): `0x${string}` {
  const bytes = crypto.randomBytes(32);
  return `0x${bytes.toString('hex')}` as `0x${string}`;
}

/**
 * Save private key to keystore.json.
 * On-chain PermissionManager is the real security boundary — the session key
 * can only act within its granted permission scope regardless of local access.
 */
export function saveKeystore(privateKeyHex: string, address: string): void {
  const keystore: KeystoreFile = {
    version: 2,
    privateKey: privateKeyHex,
    address,
    createdAt: new Date().toISOString(),
  };

  ensureDir(PATHS.root);
  fs.writeFileSync(PATHS.keystore, JSON.stringify(keystore, null, 2) + '\n', {
    encoding: 'utf-8',
    mode: 0o600,
  });
}

/**
 * Load private key hex from keystore.json.
 */
export function loadSessionKey(): string {
  if (!fs.existsSync(PATHS.keystore)) {
    throw new Error('No session configured. Run `jaw session setup` first.');
  }

  const raw = JSON.parse(fs.readFileSync(PATHS.keystore, 'utf-8')) as KeystoreFile;
  return raw.privateKey;
}

/**
 * Delete keystore.json.
 */
export function deleteKeystore(): void {
  if (fs.existsSync(PATHS.keystore)) {
    fs.unlinkSync(PATHS.keystore);
  }
}

/**
 * Check if keystore.json exists.
 */
export function keystoreExists(): boolean {
  return fs.existsSync(PATHS.keystore);
}
