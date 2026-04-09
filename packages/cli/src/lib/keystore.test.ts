import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';

const TEST_ROOT = path.join(os.tmpdir(), 'jaw-keystore-test');
const TEST_API_KEY = 'test-api-key-12345';

vi.mock('./paths.js', () => {
  const p = require('node:path');
  const o = require('node:os');
  const root = p.join(o.tmpdir(), 'jaw-keystore-test');
  return {
    PATHS: {
      root,
      config: p.join(root, 'config.json'),
      keystore: p.join(root, 'keystore.json'),
      sessionConfig: p.join(root, 'session-config.json'),
    },
  };
});

const { generateSessionKey, encryptAndSaveKeystore, loadSessionKey, deleteKeystore, keystoreExists } = await import(
  './keystore.js'
);
const { PATHS } = await import('./paths.js');

beforeEach(() => {
  if (fs.existsSync(TEST_ROOT)) fs.rmSync(TEST_ROOT, { recursive: true });
  fs.mkdirSync(TEST_ROOT, { recursive: true });
});

afterEach(() => {
  if (fs.existsSync(TEST_ROOT)) fs.rmSync(TEST_ROOT, { recursive: true });
});

describe('keystore', () => {
  it('generateSessionKey returns a 0x-prefixed 64-char hex string', () => {
    const key = generateSessionKey();
    expect(key).toMatch(/^0x[0-9a-f]{64}$/);
  });

  it('encrypt then decrypt round-trips the key', () => {
    const key = generateSessionKey();
    encryptAndSaveKeystore(key, '0xabc123', TEST_API_KEY);
    const decrypted = loadSessionKey(TEST_API_KEY);
    expect(decrypted).toBe(key);
  });

  it('loadSessionKey throws if keystore does not exist', () => {
    expect(() => loadSessionKey(TEST_API_KEY)).toThrow(/No session configured/);
  });

  it('loadSessionKey throws with wrong API key', () => {
    const key = generateSessionKey();
    encryptAndSaveKeystore(key, '0xabc123', TEST_API_KEY);
    expect(() => loadSessionKey('wrong-api-key')).toThrow(/Failed to decrypt/);
  });

  it('deleteKeystore removes the file', () => {
    const key = generateSessionKey();
    encryptAndSaveKeystore(key, '0xabc123', TEST_API_KEY);
    expect(fs.existsSync(PATHS.keystore)).toBe(true);
    deleteKeystore();
    expect(fs.existsSync(PATHS.keystore)).toBe(false);
  });

  it('keystoreExists returns false when no file', () => {
    expect(keystoreExists()).toBe(false);
  });

  it('keystoreExists returns true after save', () => {
    encryptAndSaveKeystore(generateSessionKey(), '0xabc123', TEST_API_KEY);
    expect(keystoreExists()).toBe(true);
  });

  it('keystore.json has version 1 and expected fields', () => {
    encryptAndSaveKeystore(generateSessionKey(), '0xabc123', TEST_API_KEY);
    const raw = JSON.parse(fs.readFileSync(PATHS.keystore, 'utf-8'));
    expect(raw.version).toBe(1);
    expect(raw.iv).toBeDefined();
    expect(raw.salt).toBeDefined();
    expect(raw.ciphertext).toBeDefined();
    expect(raw.tag).toBeDefined();
    expect(raw.address).toBe('0xabc123');
    expect(raw.createdAt).toBeDefined();
  });
});
