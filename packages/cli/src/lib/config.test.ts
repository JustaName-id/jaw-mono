import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import type { JawConfig } from './types.js';

const TEST_ROOT = path.join(os.tmpdir(), 'jaw-config-test');

vi.mock('./paths.js', () => {
  const p = require('node:path');
  const o = require('node:os');
  const root = p.join(o.tmpdir(), 'jaw-config-test');
  return {
    PATHS: {
      root,
      config: p.join(root, 'config.json'),
      session: p.join(root, 'session.json'),
    },
  };
});
const { loadConfig, saveConfig, setConfigValue } = await import('./config.js');
const { PATHS } = await import('./paths.js');

beforeEach(() => {
  if (fs.existsSync(TEST_ROOT)) {
    fs.rmSync(TEST_ROOT, { recursive: true });
  }
});

afterEach(() => {
  if (fs.existsSync(TEST_ROOT)) {
    fs.rmSync(TEST_ROOT, { recursive: true });
  }
});

describe('config', () => {
  it('loadConfig returns empty object when no config exists', () => {
    expect(loadConfig()).toEqual({});
  });

  it('saveConfig creates config file', () => {
    saveConfig({ apiKey: 'test-key', defaultChain: 8453 });
    const saved = loadConfig();
    expect(saved.apiKey).toBe('test-key');
    expect(saved.defaultChain).toBe(8453);
  });

  it('setConfigValue creates directory and merges with existing config', () => {
    setConfigValue('apiKey', 'first');
    setConfigValue('defaultChain', 1);
    const config = loadConfig();
    expect(config.apiKey).toBe('first');
    expect(config.defaultChain).toBe(1);
    expect(fs.existsSync(PATHS.root)).toBe(true);
  });

  it('setConfigValue updates a single value', () => {
    saveConfig({ apiKey: 'old-key' });
    setConfigValue('apiKey', 'new-key');
    expect(loadConfig().apiKey).toBe('new-key');
  });
});

describe('migrateConfig', () => {
  it('migrates paymasterUrl to paymasters with defaultChain', () => {
    saveConfig({
      apiKey: 'test',
      defaultChain: 1,
      paymasterUrl: 'https://pm.example.com',
    } as JawConfig);
    const config = loadConfig();
    expect(config.paymasters).toEqual({
      1: { url: 'https://pm.example.com' },
    });
    expect(config.paymasterUrl).toBeUndefined();
  });

  it('migrates paymasterUrl to paymasters with fallback chain 1', () => {
    saveConfig({
      apiKey: 'test',
      paymasterUrl: 'https://pm.example.com',
    } as JawConfig);
    const config = loadConfig();
    expect(config.paymasters).toEqual({
      1: { url: 'https://pm.example.com' },
    });
  });

  it('does not migrate if paymasters already exists', () => {
    saveConfig({
      apiKey: 'test',
      paymasters: { 1: { url: 'https://existing.com' } },
      paymasterUrl: 'https://old.com',
    } as JawConfig);
    const config = loadConfig();
    expect(config.paymasters).toEqual({ 1: { url: 'https://existing.com' } });
  });
});
