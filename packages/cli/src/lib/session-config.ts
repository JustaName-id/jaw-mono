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

export function saveSessionConfig(input: Omit<SessionConfig, 'createdAt'>): void {
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
  const raw = fs.readFileSync(PATHS.sessionConfig, 'utf-8');
  try {
    return JSON.parse(raw) as SessionConfig;
  } catch {
    throw new Error(`Session config at ${PATHS.sessionConfig} is corrupted. Run \`jaw session setup\` to recreate it.`);
  }
}

export function deleteSessionConfig(): void {
  if (fs.existsSync(PATHS.sessionConfig)) {
    fs.unlinkSync(PATHS.sessionConfig);
  }
}
