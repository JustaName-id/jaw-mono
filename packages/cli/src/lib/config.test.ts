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
const { loadConfig, saveConfig, setConfigValue, setX402PolicyValue, redactConfig } = await import('./config.js');
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

describe('redactConfig', () => {
  it('masks the apiKey', () => {
    const redacted = redactConfig({ apiKey: 'abcdefgh-rest-is-secret' });
    expect(redacted.apiKey).toBe('abcdefgh...');
  });

  it('masks query-string secrets in paymaster URLs', () => {
    const redacted = redactConfig({
      paymasters: { 84532: { url: 'https://api.pimlico.io/v2/84532/rpc?apikey=pim_secret123' } },
    }) as { paymasters: Record<number, { url: string }> };
    expect(redacted.paymasters[84532].url).not.toContain('pim_secret123');
    expect(redacted.paymasters[84532].url).toContain('https://api.pimlico.io/v2/84532/rpc');
  });

  it('leaves paymaster URLs without query strings intact', () => {
    const redacted = redactConfig({
      paymasters: { 1: { url: 'https://paymaster.example.com/rpc' } },
    }) as { paymasters: Record<number, { url: string }> };
    expect(redacted.paymasters[1].url).toBe('https://paymaster.example.com/rpc');
  });

  it('masks the free-form paymaster context (a provider could stash a token there)', () => {
    const redacted = redactConfig({
      paymasters: { 84532: { url: 'https://pm.example.com/rpc', context: { sponsorshipPolicyId: 'sp_secret' } } },
    }) as { paymasters: Record<number, { url: string; context?: unknown }> };
    expect(redacted.paymasters[84532].context).toBe('***');
    expect(JSON.stringify(redacted)).not.toContain('sp_secret');
  });

  it('leaves the context undefined when there is none', () => {
    const redacted = redactConfig({
      paymasters: { 1: { url: 'https://pm.example.com/rpc' } },
    }) as { paymasters: Record<number, { context?: unknown }> };
    expect(redacted.paymasters[1].context).toBeUndefined();
  });
});

describe('setX402PolicyValue', () => {
  it('sets a scalar cap and merges into the x402 block', () => {
    setX402PolicyValue('maxAmountPerPayment', '50000');
    setX402PolicyValue('maxTotalPerSession', '1000000');
    expect(loadConfig().x402).toEqual({ maxAmountPerPayment: '50000', maxTotalPerSession: '1000000' });
  });

  it('comma-splits an allow-list field', () => {
    setX402PolicyValue('allowedNetworks', 'eip155:8453, eip155:84532');
    expect(loadConfig().x402?.allowedNetworks).toEqual(['eip155:8453', 'eip155:84532']);
  });

  it('does not disturb other config keys', () => {
    saveConfig({ apiKey: 'keep-me' });
    setX402PolicyValue('maxAmountPerPayment', '10');
    const config = loadConfig();
    expect(config.apiKey).toBe('keep-me');
    expect(config.x402?.maxAmountPerPayment).toBe('10');
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
