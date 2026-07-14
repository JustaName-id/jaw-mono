/**
 * Account hint application
 *
 * When this app runs embedded (cross-site iframe), its localStorage is
 * partitioned per top-level site — Brave/Safari wipe that partition between
 * visits, and flows that run in the POPUP's first-party world (e.g. a Safari
 * account switch, which routes credential methods to the popup) never update
 * it. The SDK persists the credentialId of the account the dApp is currently
 * connected as in the dApp's first-party storage (which survives and stays
 * current) and sends it back on the handshake as `lastAccount`; applying it
 * here keeps the "Continue as" screen aligned with the dApp's live
 * connection — whether the partition came up empty or holds a stale identity.
 *
 * Security: the hint is a UI pointer, not authorization, and it carries the
 * credentialId ONLY. The public key and display name are resolved from the
 * backend passkey registry — the same source of truth the sign-in/import
 * path uses — because both transit dApp-controlled storage otherwise: a
 * malicious dApp that supplied its own publicKey would control the smart
 * account address Account.get later derives from it (the passkey ceremony
 * only proves credential possession, it never checks the stored key). With
 * the backend as the source, a forged hint can only point at a different
 * credential, whose ceremony the user cannot complete. Applying is
 * append-only on the account *list* (existing local accounts are never
 * removed or replaced) and never touches auth state, which is written
 * exclusively after a real passkey ceremony. The one tradeoff of append-only:
 * a hint may re-offer an account the user removed from this partition's
 * list — it reappears as a choice, never as an authentication.
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

export type ApplyAccountHintOptions = {
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
 * Apply a handshake account hint to the passkey account list: append it when
 * missing (never removes or replaces existing entries), resolving the
 * credentialId against the backend passkey registry for the public key and
 * display name, and return the credentialId so the caller can prefer it as
 * the "Continue as" default. An already-listed credentialId short-circuits
 * without a backend roundtrip. Never throws or hangs: a storage failure,
 * lookup failure or timeout must degrade to the no-hint experience, not
 * block the dialog.
 *
 * @param hint - The `lastAccount` value from the SDK handshake config (untrusted)
 * @param options - apiKey plus test seams (storage, lookup, timeout)
 * @returns the hinted credentialId when applied (or already listed), null otherwise
 */
export async function applyAccountHint(hint: unknown, options: ApplyAccountHintOptions = {}): Promise<string | null> {
  if (!isValidAccountHint(hint)) return null;

  const { apiKey, storage, lookup = lookupPasskeyFromBackend, timeoutMs = LOOKUP_TIMEOUT_MS } = options;

  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const manager = new PasskeyManager(storage, undefined, apiKey);
    // Already listed → nothing to append and no lookup needed; still return
    // the credentialId so the caller can prefer it as the default.
    if (manager.fetchAccounts().some((account) => account.credentialId === hint.credentialId)) {
      return hint.credentialId;
    }

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

    // Dedupe lives in addAccountToList: if the same credentialId landed while
    // the lookup was in flight (e.g. a second handshake config), this is a
    // no-op — existing entries are never replaced.
    manager.addAccountToList({
      username: passkey.displayName?.trim() || 'Passkey',
      // The hint's credentialId (what the ceremony will use), not the
      // backend's echo — prevents encoding mismatches, same as the import path.
      credentialId: hint.credentialId,
      publicKey: passkey.publicKey,
      creationDate: new Date().toISOString(),
      isImported: false,
    });
    return hint.credentialId;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}
