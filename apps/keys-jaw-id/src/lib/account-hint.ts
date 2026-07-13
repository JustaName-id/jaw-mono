/**
 * Account hint seeding
 *
 * When this app runs embedded (cross-site iframe), its localStorage is
 * partitioned per top-level site — and Brave/Safari wipe that partition
 * between visits, so the account list behind the "Continue as" screen keeps
 * disappearing. The SDK persists the last connected account's credentialId in
 * the dApp's first-party storage (which survives) and sends it back on the
 * handshake as `lastAccount`; seeding it here restores "Continue as".
 *
 * Security: the hint is a UI pointer, not authorization, and it carries the
 * credentialId ONLY. The public key and display name are resolved from the
 * backend passkey registry — the same source of truth the sign-in/import
 * path uses — because both transit dApp-controlled storage otherwise: a
 * malicious dApp that supplied its own publicKey would control the smart
 * account address Account.get later derives from it (the passkey ceremony
 * only proves credential possession, it never checks the stored key). With
 * the backend as the source, a forged hint can only point at a different
 * credential, whose ceremony the user cannot complete. Seeding still only
 * touches the account *list* — never auth state, which is written
 * exclusively after a real passkey ceremony — and never overrides existing
 * local state: only an empty account list is seeded.
 */

import {
  PasskeyManager,
  isValidAccountHint,
  lookupPasskeyFromBackend,
  type PasskeyLookupResponse,
  type SyncStorage,
} from '@jaw.id/core';

/** Bound on the backend lookup: past this, degrade to the no-hint experience. */
const LOOKUP_TIMEOUT_MS = 5000;

export type SeedAccountsOptions = {
  /** API key forwarded on the handshake config; authenticates the lookup */
  apiKey?: string;
  /** Storage override (tests); defaults to localStorage */
  storage?: SyncStorage;
  /** Lookup override (tests); defaults to the backend registry lookup */
  lookup?: (credentialId: string, apiKey?: string) => Promise<PasskeyLookupResponse>;
  /** Lookup timeout override (tests) */
  timeoutMs?: number;
};

/**
 * Seed the passkey account list (and the "Continue as" default) from a
 * handshake hint, resolving the credentialId against the backend passkey
 * registry for the public key and display name. No-op unless the hint is
 * valid, the local list is empty, and the lookup succeeds in time. Never
 * throws or hangs: a failure must degrade to the no-hint experience, not
 * block the dialog.
 *
 * @param hint - The `lastAccount` value from the SDK handshake config (untrusted)
 * @param options - apiKey plus test seams (storage, lookup, timeout)
 * @returns true when the hint was seeded
 */
export async function seedAccountsFromHint(hint: unknown, options: SeedAccountsOptions = {}): Promise<boolean> {
  if (!isValidAccountHint(hint)) return false;

  const { apiKey, storage, lookup = lookupPasskeyFromBackend, timeoutMs = LOOKUP_TIMEOUT_MS } = options;

  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const manager = new PasskeyManager(storage, undefined, apiKey);
    if (manager.fetchAccounts().length > 0) return false;

    const lookupPromise = lookup(hint.credentialId, apiKey);
    // A rejection landing after the timeout won the race must not surface as
    // an unhandled rejection.
    lookupPromise.catch(() => undefined);
    const passkey = await Promise.race([
      lookupPromise,
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error('passkey lookup timed out')), timeoutMs);
      }),
    ]);

    // The list may have been written while the lookup was in flight (e.g. a
    // second handshake config); never override it.
    if (manager.fetchAccounts().length > 0) return false;

    manager.addAccountToList({
      username: passkey.displayName?.trim() || 'Passkey',
      // The hint's credentialId (what the ceremony will use), not the
      // backend's echo — prevents encoding mismatches, same as the import path.
      credentialId: hint.credentialId,
      publicKey: passkey.publicKey,
      creationDate: new Date().toISOString(),
      isImported: false,
    });
    return true;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}
