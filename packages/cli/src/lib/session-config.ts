import * as fs from 'node:fs';
import { PATHS } from './paths.js';
import { ensureDir } from './config.js';

/**
 * How the session account address is derived. 'counterfactual' (the default,
 * and what configs written before this field existed mean): a CREATE2
 * prediction from the account factory, a separate address from the session
 * key EOA. 'eip7702': the session key EOA itself, upgraded in place via an
 * EIP-7702 delegation attached to its first userOp — session account and
 * x402 payer collapse into one address.
 */
export type SessionMode = 'counterfactual' | 'eip7702';

export interface SessionConfig {
  ownerAddress: string;
  sessionAddress: string;
  permissionId: string;
  chainId: number;
  expiry: number;
  createdAt: string;
  mode?: SessionMode;
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
  fs.chmodSync(PATHS.sessionConfig, 0o600);
}

export function sessionConfigExists(): boolean {
  return fs.existsSync(PATHS.sessionConfig);
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

/**
 * Like `loadSessionConfig`, but returns null instead of throwing when the file
 * is missing or unreadable. For callers that can recover from a keystore whose
 * session-config is gone (interrupted setup, manual deletion, partial restore)
 * rather than callers that need an existing session to do their job.
 */
export function tryLoadSessionConfig(): SessionConfig | null {
  try {
    return loadSessionConfig();
  } catch {
    return null;
  }
}

export function deleteSessionConfig(): void {
  if (fs.existsSync(PATHS.sessionConfig)) {
    fs.unlinkSync(PATHS.sessionConfig);
  }
}
