import * as fs from 'node:fs';
import { PATHS } from './paths.js';
import { ensureDir } from './config.js';

export interface SessionConfig {
  ownerAddress: string;
  sessionAddress: string;
  permissionId: string;
  chainId: number;
  expiry: number;
  createdAt: string;
}

export interface SaveSessionConfigInput {
  ownerAddress: string;
  sessionAddress: string;
  permissionId: string;
  chainId: number;
  expiry: number;
}

export function saveSessionConfig(input: SaveSessionConfigInput): void {
  const config: SessionConfig = {
    ...input,
    createdAt: new Date().toISOString(),
  };
  ensureDir(PATHS.root);
  fs.writeFileSync(PATHS.sessionConfig, JSON.stringify(config, null, 2) + '\n', {
    encoding: 'utf-8',
    mode: 0o600,
  });
}

export function loadSessionConfig(): SessionConfig {
  if (!fs.existsSync(PATHS.sessionConfig)) {
    throw new Error('No session configured. Run `jaw session setup` first.');
  }
  return JSON.parse(fs.readFileSync(PATHS.sessionConfig, 'utf-8')) as SessionConfig;
}

export function deleteSessionConfig(): void {
  if (fs.existsSync(PATHS.sessionConfig)) {
    fs.unlinkSync(PATHS.sessionConfig);
  }
}

export function isSessionValid(): boolean {
  try {
    const config = loadSessionConfig();
    return config.expiry > Date.now() / 1000;
  } catch {
    return false;
  }
}
