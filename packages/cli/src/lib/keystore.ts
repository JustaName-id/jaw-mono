import * as crypto from 'node:crypto';
import * as fs from 'node:fs';
import { PATHS } from './paths.js';
import { ensureDir } from './config.js';

interface KeystoreFile {
  version: 1;
  iv: string;
  salt: string;
  ciphertext: string;
  tag: string;
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
 * Derive AES-256 key from API key.
 * Keystore is useless without the API key. On-chain PermissionManager is the real security boundary.
 */
function deriveKey(apiKey: string, salt: Buffer): Buffer {
  return crypto
    .createHash('sha256')
    .update(Buffer.concat([salt, Buffer.from(apiKey)]))
    .digest();
}

/**
 * Encrypt private key and save to keystore.json.
 */
export function encryptAndSaveKeystore(privateKeyHex: string, address: string, apiKey: string): void {
  const salt = crypto.randomBytes(16);
  const iv = crypto.randomBytes(12);
  const key = deriveKey(apiKey, salt);

  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const encrypted = Buffer.concat([cipher.update(privateKeyHex, 'utf-8'), cipher.final()]);
  const tag = cipher.getAuthTag();

  const keystore: KeystoreFile = {
    version: 1,
    iv: iv.toString('base64'),
    salt: salt.toString('base64'),
    ciphertext: encrypted.toString('base64'),
    tag: tag.toString('base64'),
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
 * Decrypt keystore.json and return private key hex.
 */
export function loadSessionKey(apiKey: string): string {
  if (!fs.existsSync(PATHS.keystore)) {
    throw new Error('No session configured. Run `jaw session setup` first.');
  }

  const raw = JSON.parse(fs.readFileSync(PATHS.keystore, 'utf-8')) as KeystoreFile;
  const salt = Buffer.from(raw.salt, 'base64');
  const iv = Buffer.from(raw.iv, 'base64');
  const ciphertext = Buffer.from(raw.ciphertext, 'base64');
  const tag = Buffer.from(raw.tag, 'base64');
  const key = deriveKey(apiKey, salt);

  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(tag);

  try {
    const decrypted = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
    return decrypted.toString('utf-8');
  } catch {
    throw new Error('Failed to decrypt keystore. API key may have changed. Run `jaw session revoke` and set up again.');
  }
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
