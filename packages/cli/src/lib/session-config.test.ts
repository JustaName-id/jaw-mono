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

const { saveSessionConfig, loadSessionConfig, tryLoadSessionConfig, deleteSessionConfig } = await import(
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
  mode: 'eip7702' as const,
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

  it('round-trips the derivation mode', () => {
    saveSessionConfig(SAMPLE_CONFIG);
    expect(loadSessionConfig().mode).toBe('eip7702');
  });

  // The writer cannot produce one any more, so the fixture is a file. Loading
  // stays permissive so `session status` and `session revoke` still work on a
  // session an older CLI wrote; auto mode is where it is refused.
  it('reads a config from before the field existed without complaining', () => {
    const legacy: Record<string, unknown> = { ...SAMPLE_CONFIG, createdAt: new Date().toISOString() };
    delete legacy.mode;
    fs.mkdirSync(PATHS.root, { recursive: true });
    fs.writeFileSync(PATHS.sessionConfig, JSON.stringify(legacy));
    expect(loadSessionConfig().mode).toBeUndefined();
    expect(loadSessionConfig().permissionId).toBe('0xPerm');
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

  it('loadSessionConfig throws a helpful error on corrupted JSON', () => {
    fs.writeFileSync(PATHS.sessionConfig, '{ not valid json', { mode: 0o600 });
    expect(() => loadSessionConfig()).toThrow(/corrupted/);
  });

  it('tryLoadSessionConfig returns null instead of throwing when the file is missing', () => {
    expect(fs.existsSync(PATHS.sessionConfig)).toBe(false);
    expect(() => loadSessionConfig()).toThrow();
    expect(tryLoadSessionConfig()).toBeNull();
  });

  it('tryLoadSessionConfig returns null on a corrupt file', () => {
    fs.writeFileSync(PATHS.sessionConfig, '{ not valid json', { mode: 0o600 });
    expect(tryLoadSessionConfig()).toBeNull();
  });

  it('tryLoadSessionConfig returns the config when it is readable', () => {
    saveSessionConfig(SAMPLE_CONFIG);
    expect(tryLoadSessionConfig()?.permissionId).toBe('0xPerm');
  });

  it('saveSessionConfig enforces 0o600 mode even when overwriting an existing file', () => {
    saveSessionConfig(SAMPLE_CONFIG);
    expect(fs.statSync(PATHS.sessionConfig).mode & 0o777).toBe(0o600);
    fs.chmodSync(PATHS.sessionConfig, 0o644);
    expect(fs.statSync(PATHS.sessionConfig).mode & 0o777).toBe(0o644);
    saveSessionConfig({ ...SAMPLE_CONFIG, permissionId: '0xPerm2' });
    expect(fs.statSync(PATHS.sessionConfig).mode & 0o777).toBe(0o600);
  });
});
