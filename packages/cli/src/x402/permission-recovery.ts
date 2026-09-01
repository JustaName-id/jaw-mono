import { saveRecoveredPermission, parseGrantedPermission, type SessionConfig } from '../lib/session-config.js';
import type { GrantedPermission } from '../lib/session-config.js';

/**
 * The permission struct for a session that was created before the CLI kept one.
 *
 * Those sessions hold only the id, and no view on the permission manager takes
 * an id, so every on-chain read reports "cannot tell" and `session add` refuses
 * for want of a scope to merge against. Telling people to run setup again is a
 * poor answer when the grant is recoverable: the relay stores what was granted,
 * keyed by the same hash, and `getPermissionFromRelay` returns it.
 *
 * Recovered once and written back, so this costs one GET on the first command
 * that needs it and nothing afterwards. Anything that goes wrong leaves the
 * session exactly as it was, which is the behaviour every such session had
 * before this existed: a failed recovery must not turn a working command into
 * an error.
 */

const RECOVERY_TIMEOUT_MS = 5_000;

export interface RecoveryDeps {
  /** Injected for tests, and so the unit tests never import core. */
  fetchPermission?: (permissionId: string, apiKey: string) => Promise<unknown>;
  timeoutMs?: number;
}

export async function recoverPermission(
  session: SessionConfig,
  apiKey: string | undefined,
  deps: RecoveryDeps = {}
): Promise<GrantedPermission | undefined> {
  if (session.permission) return session.permission;
  if (!apiKey) return undefined;

  const fetchPermission =
    deps.fetchPermission ??
    (async (id: string, key: string) => {
      // Lazy, like every other core import in the CLI: a static one pulls the
      // whole SDK into startup for a command that may never need it.
      const { getPermissionFromRelay } = await import('@jaw.id/core');
      return getPermissionFromRelay(id as `0x${string}`, key);
    });

  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const expired = new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error('timed out')), deps.timeoutMs ?? RECOVERY_TIMEOUT_MS);
    });
    const relayed = await Promise.race([fetchPermission(session.permissionId, apiKey), expired]);
    const permission = parseGrantedPermission(relayed);
    if (!permission) return undefined;
    // Whether it describes the permission that was granted is settled on chain,
    // by the `getHash` check every read here goes through. Storing one that does
    // not match costs a `mismatch` report, which is what the session already
    // showed as `unknown`, and never a wrong answer.
    saveRecoveredPermission(session, permission);
    return permission;
  } catch {
    return undefined;
  } finally {
    clearTimeout(timer);
  }
}
