import * as fs from 'node:fs';
import { PATHS } from './paths.js';
import { ensureDir } from './config.js';
import type { PeriodUnit } from '../x402/period.js';

/**
 * How the session account address is derived. 'counterfactual' (the default,
 * and what configs written before this field existed mean): a CREATE2
 * prediction from the account factory, a separate address from the session
 * key EOA. 'eip7702': the session key EOA itself, upgraded in place via an
 * EIP-7702 delegation attached to its first userOp — session account and
 * x402 payer collapse into one address.
 */
export type SessionMode = 'counterfactual' | 'eip7702';

/**
 * The USDC spend limit captured from the on-chain permission at setup, so the
 * local x402 policy can be seeded from what the user actually granted instead of
 * being configured separately and drifting from it. `allowance` is one period's
 * worth in base units (decimal string); `network` is the session chain's CAIP-2
 * id. Absent when the granted permission carries no registry-USDC spend.
 */
export interface GrantedSpend {
  token: string;
  allowance: string;
  network: string;
  /**
   * The period the allowance resets over, and how many of those units make one
   * period. Without these the allowance is dimensionless, and a per-period
   * number reads as a per-session one: a 5-USDC/day grant over a 7-day expiry
   * would cap the whole session at 5 instead of allowing 5 each day.
   *
   * Optional because configs written before this existed have no period
   * recorded. Consumers fall back to treating the allowance as session-wide,
   * which is what those configs already meant.
   */
  unit?: PeriodUnit;
  multiplier?: number;
  /**
   * ISO timestamp the periods are anchored at. The contract anchors at the
   * permission's `start`, which the grant response does not return, so this is
   * the local time the session was created. Anchoring early only makes a window
   * close sooner than the chain's, which refuses ahead of the chain rather than
   * behind it.
   */
  periodAnchor?: string;
}

export interface SessionConfig {
  ownerAddress: string;
  sessionAddress: string;
  permissionId: string;
  chainId: number;
  expiry: number;
  createdAt: string;
  mode?: SessionMode;
  grantedSpend?: GrantedSpend;
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
