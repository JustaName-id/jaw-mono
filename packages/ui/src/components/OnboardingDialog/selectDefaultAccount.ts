import type { LocalStorageAccount } from './types';

/**
 * Choose the account to show in the "Continue with X" screen (Layout A).
 *
 * Precedence:
 *   1. No accounts        -> null (caller shows Layout B / "Sign In").
 *   2. Last signed-in     -> the account whose credentialId matches
 *      `lastAuthenticatedCredentialId` (from jaw:passkey:authState).
 *   3. Fallback           -> the account with the most recent creationDate.
 */
export function selectDefaultAccount(
  accounts: LocalStorageAccount[],
  lastAuthenticatedCredentialId?: string | null
): LocalStorageAccount | null {
  if (accounts.length === 0) return null;

  if (lastAuthenticatedCredentialId) {
    const match = accounts.find((a) => a.credentialId === lastAuthenticatedCredentialId);
    if (match) return match;
  }

  return accounts.reduce((latest, a) => (a.creationDate.getTime() > latest.creationDate.getTime() ? a : latest));
}
