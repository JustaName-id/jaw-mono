import * as fs from 'node:fs';
import { PATHS } from './paths.js';
import type { JawConfig } from './types.js';
import { isValidKeysUrl, isValidRelayUrl } from './validation.js';

export function ensureDir(dir: string): void {
  fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  fs.chmodSync(dir, 0o700);
}

function migrateConfig(config: JawConfig): JawConfig {
  if (config.paymasterUrl && !config.paymasters) {
    const chainId = config.defaultChain ?? 84532;
    config.paymasters = { [chainId]: { url: config.paymasterUrl } };
    delete config.paymasterUrl;
    saveConfig(config);
  }
  return config;
}

export function loadConfig(): JawConfig {
  if (!fs.existsSync(PATHS.config)) {
    return {};
  }
  const raw = fs.readFileSync(PATHS.config, 'utf-8');
  try {
    const config = JSON.parse(raw) as JawConfig;
    return migrateConfig(config);
  } catch {
    throw new Error(
      `Config file at ${PATHS.config} is not valid JSON. Run \`jaw config set apiKey=<key>\` to reset it.`
    );
  }
}

export function saveConfig(config: JawConfig): void {
  ensureDir(PATHS.root);
  fs.writeFileSync(PATHS.config, JSON.stringify(config, null, 2) + '\n', {
    encoding: 'utf-8',
    mode: 0o600,
  });
}

export function redactConfig(config: JawConfig): Record<string, unknown> {
  return {
    ...config,
    apiKey: config.apiKey ? `${config.apiKey.slice(0, 8)}...` : undefined,
  };
}

export function getConfigValue(key: keyof JawConfig): string | number | undefined {
  const config = loadConfig();
  return config[key];
}

export function setConfigValue(key: keyof JawConfig, value: string | number): void {
  if (key === 'keysUrl' && typeof value === 'string' && !isValidKeysUrl(value)) {
    throw new Error(`Untrusted keysUrl: ${value}. Must be a *.jaw.id domain (HTTPS) or localhost.`);
  }
  if (key === 'relayUrl' && typeof value === 'string' && !isValidRelayUrl(value)) {
    throw new Error(`Untrusted relayUrl: ${value}. Must be wss://*.jaw.id or ws://localhost.`);
  }
  const config = loadConfig();
  const updated = { ...config, [key]: value };
  saveConfig(updated);
}
