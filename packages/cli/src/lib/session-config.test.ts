import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';

const TEST_ROOT = path.join(os.tmpdir(), 'jaw-session-config-test');

vi.mock('./paths.js', () => {
  const p = require('node:path');
  const o = require('node:os');
  const root = p.join(o.tmpdir(), 'jaw-session-config-test');
  return {
    PATHS: {
      root,
      config: p.join(root, 'config.json'),
      keystore: p.join(root, 'keystore.json'),
      sessionConfig: p.join(root, 'session-config.json'),
    },
  };
});

const { saveSessionConfig, loadSessionConfig, deleteSessionConfig, isSessionValid } = await import(
  './session-config.js'
);
const { PATHS } = await import('./paths.js');

beforeEach(() => {
  if (fs.existsSync(TEST_ROOT)) fs.rmSync(TEST_ROOT, { recursive: true });
  fs.mkdirSync(TEST_ROOT, { recursive: true });
});

afterEach(() => {
  if (fs.existsSync(TEST_ROOT)) fs.rmSync(TEST_ROOT, { recursive: true });
});

const SAMPLE_CONFIG = {
  ownerAddress: '0xOwner' as const,
  sessionAddress: '0xSession' as const,
  permissionId: '0xPerm' as const,
  chainId: 84532,
  expiry: Math.floor(Date.now() / 1000) + 86400 * 7,
};

describe('session-config', () => {
  it('save then load round-trips', () => {
    saveSessionConfig(SAMPLE_CONFIG);
    const loaded = loadSessionConfig();
    expect(loaded.ownerAddress).toBe('0xOwner');
    expect(loaded.sessionAddress).toBe('0xSession');
    expect(loaded.permissionId).toBe('0xPerm');
    expect(loaded.chainId).toBe(84532);
    expect(loaded.createdAt).toBeDefined();
  });

  it('loadSessionConfig throws if file does not exist', () => {
    expect(() => loadSessionConfig()).toThrow(/No session configured/);
  });

  it('deleteSessionConfig removes the file', () => {
    saveSessionConfig(SAMPLE_CONFIG);
    expect(fs.existsSync(PATHS.sessionConfig)).toBe(true);
    deleteSessionConfig();
    expect(fs.existsSync(PATHS.sessionConfig)).toBe(false);
  });

  it('isSessionValid returns true for future expiry', () => {
    saveSessionConfig(SAMPLE_CONFIG);
    expect(isSessionValid()).toBe(true);
  });

  it('isSessionValid returns false for past expiry', () => {
    saveSessionConfig({ ...SAMPLE_CONFIG, expiry: 1000 });
    expect(isSessionValid()).toBe(false);
  });

  it('isSessionValid returns false when no config', () => {
    expect(isSessionValid()).toBe(false);
  });
});
