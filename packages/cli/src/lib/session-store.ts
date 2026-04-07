/**
 * Persists CLI session state to ~/.jaw/session.json
 * Avoids re-authenticating on every CLI invocation.
 */

import * as fs from 'node:fs';
import { PATHS } from './paths.js';
import { ensureDir } from './config.js';
import { isValidAddress } from './validation.js';

export interface CLISession {
  readonly address: string;
  readonly chainId: number;
  readonly connectedAt: string;
  readonly expiresAt: string;
}

const SESSION_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

function isValidSessionShape(session: unknown): session is CLISession {
  if (!session || typeof session !== 'object') return false;
  const s = session as Record<string, unknown>;
  return (
    typeof s.address === 'string' &&
    isValidAddress(s.address) &&
    typeof s.chainId === 'number' &&
    Number.isInteger(s.chainId) &&
    s.chainId > 0 &&
    typeof s.connectedAt === 'string' &&
    !Number.isNaN(Date.parse(s.connectedAt)) &&
    typeof s.expiresAt === 'string' &&
    !Number.isNaN(Date.parse(s.expiresAt))
  );
}

export function loadSession(): CLISession | null {
  try {
    if (!fs.existsSync(PATHS.session)) return null;
    const raw = fs.readFileSync(PATHS.session, 'utf-8');
    const parsed = JSON.parse(raw) as unknown;
    if (!isValidSessionShape(parsed)) {
      clearSession();
      return null;
    }
    if (!isSessionValid(parsed)) {
      clearSession();
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export function saveSession(session: CLISession): void {
  ensureDir(PATHS.root);
  fs.writeFileSync(PATHS.session, JSON.stringify(session, null, 2) + '\n', {
    encoding: 'utf-8',
    mode: 0o600,
  });
}

export function clearSession(): void {
  try {
    if (fs.existsSync(PATHS.session)) {
      fs.unlinkSync(PATHS.session);
    }
  } catch {
    // ignore
  }
}

export function isSessionValid(session: CLISession): boolean {
  return new Date(session.expiresAt).getTime() > Date.now();
}

export function createSession(address: string, chainId: number): CLISession {
  const now = new Date();
  return {
    address,
    chainId,
    connectedAt: now.toISOString(),
    expiresAt: new Date(now.getTime() + SESSION_TTL_MS).toISOString(),
  };
}
