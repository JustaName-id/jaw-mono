/**
 * Account hint seeding
 *
 * When this app runs embedded (cross-site iframe), its localStorage is
 * partitioned per top-level site — and Brave/Safari wipe that partition
 * between visits, so the account list behind the "Continue as" screen keeps
 * disappearing. The SDK persists the last connected account in the dApp's
 * first-party storage (which survives) and sends it back on the handshake as
 * `lastAccount`; seeding it here restores "Continue as".
 *
 * Security: the hint is a UI pointer, not authorization. Continuing always
 * runs the full passkey ceremony against the seeded credentialId, so a forged
 * hint can only ever offer a "Continue as" that fails to sign. Seeding also
 * never overrides existing local state — only an empty account list is seeded.
 */

import { PasskeyManager, isValidAccountHint, type SyncStorage } from '@jaw.id/core';

/**
 * Seed the passkey account list (and the "Continue as" default) from a
 * handshake hint. No-op unless the hint is valid and the local list is empty.
 *
 * @param hint - The `lastAccount` value from the SDK handshake config (untrusted)
 * @param storage - Optional storage override (tests); defaults to localStorage
 * @returns true when the hint was seeded
 */
export function seedAccountsFromHint(hint: unknown, storage?: SyncStorage): boolean {
  if (!isValidAccountHint(hint)) return false;

  const manager = new PasskeyManager(storage);
  if (manager.fetchAccounts().length > 0) return false;

  manager.addAccountToList({
    username: hint.username,
    credentialId: hint.credentialId,
    publicKey: hint.publicKey,
    creationDate: new Date().toISOString(),
    isImported: false,
  });
  manager.storeAuthState(hint.address, hint.credentialId);
  return true;
}
