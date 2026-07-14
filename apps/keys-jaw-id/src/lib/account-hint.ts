/**
 * Account hint application
 *
 * When this app runs embedded (cross-site iframe), its localStorage is
 * partitioned per top-level site — Brave/Safari wipe that partition between
 * visits, and flows that run in the POPUP's first-party world (e.g. a Safari
 * account switch, which routes credential methods to the popup) never update
 * it. The SDK persists the account the dApp is currently connected as in the
 * dApp's first-party storage (which survives and stays current) and sends it
 * back on the handshake as `lastAccount`; applying it here keeps the
 * "Continue as" screen aligned with the dApp's live connection — whether the
 * partition came up empty or holds a stale identity.
 *
 * Security: the hint is a UI pointer, not authorization. It is append-only on
 * the account *list* (existing local accounts are never removed or replaced)
 * and never touches auth state, which is written exclusively after a real
 * passkey ceremony (with the address derived from the credential, not taken
 * from the hint). A forged hint can only ever offer a "Continue as" that
 * fails to sign. The one tradeoff of append-only: a hint may re-offer an
 * account the user removed from this partition's list — it reappears as a
 * choice, never as an authentication.
 */

import { PasskeyManager, isValidAccountHint, type SyncStorage } from '@jaw.id/core';

/**
 * Apply a handshake account hint to the passkey account list: append it when
 * missing (never removes or replaces existing entries) and return its
 * credentialId so the caller can prefer it as the "Continue as" default.
 * Never throws: this runs on the handshake path before the SDK is told the
 * dialog is ready, so a storage failure must degrade to the no-hint
 * experience, not block connect.
 *
 * @param hint - The `lastAccount` value from the SDK handshake config (untrusted)
 * @param storage - Optional storage override (tests); defaults to localStorage
 * @returns the hinted credentialId when applied, null otherwise
 */
export function applyAccountHint(hint: unknown, storage?: SyncStorage): string | null {
  if (!isValidAccountHint(hint)) return null;

  try {
    const manager = new PasskeyManager(storage);
    // Dedupe lives in addAccountToList: an already-listed credentialId is a
    // no-op, so re-applying the same hint never duplicates entries.
    manager.addAccountToList({
      username: hint.username,
      credentialId: hint.credentialId,
      publicKey: hint.publicKey,
      creationDate: new Date().toISOString(),
      isImported: false,
    });
    return hint.credentialId;
  } catch {
    return null;
  }
}
