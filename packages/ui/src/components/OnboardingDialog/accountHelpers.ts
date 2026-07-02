import { Account, type PasskeyAccount } from '@jaw.id/core';
import type { LocalStorageAccount } from './types';

/** Map a stored core account to the OnboardingDialog account shape. */
export function toLocalStorageAccount(account: PasskeyAccount): LocalStorageAccount {
  return {
    username: account.username,
    creationDate: new Date(account.creationDate),
    credentialId: account.credentialId,
    isImported: account.isImported,
  };
}

/** Stored accounts in the OnboardingDialog account shape. */
export function getStoredLocalAccounts(apiKey?: string): LocalStorageAccount[] {
  return Account.getStoredAccounts(apiKey).map(toLocalStorageAccount);
}

/**
 * credentialId of the currently-authenticated account (from jaw:passkey:authState),
 * used to pick the "Continue as" default in OnboardingDialog.
 */
export function getLastAuthenticatedCredentialId(apiKey?: string): string | null {
  return Account.getCurrentAccount(apiKey)?.credentialId ?? null;
}
