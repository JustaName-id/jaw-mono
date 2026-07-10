import { describe, it, expect } from 'vitest';
import { PasskeyManager, createMemoryStorage, type SyncStorage } from '@jaw.id/core';

import { seedAccountsFromHint } from './account-hint';

const validHint = {
  username: 'ghadi.jaw.id',
  credentialId: 'A1b2-C3d4_E5f6',
  publicKey: '0xdeadbeef',
};

/**
 * When embedded, our storage is partitioned per top-level site — and wiped
 * between visits in Brave/Safari. The SDK sends back the last connected
 * account on the handshake; seeding it restores the "Continue as" screen.
 * Seeding touches only the account list — auth state is written exclusively
 * by a real passkey ceremony — so a forged hint can never fake an
 * authentication; it can only offer a "Continue as" that fails.
 */
describe('seedAccountsFromHint', () => {
  it('seeds the account list into empty storage without touching auth state', () => {
    const storage = createMemoryStorage();

    const seeded = seedAccountsFromHint(validHint, storage);

    expect(seeded).toBe(true);
    const manager = new PasskeyManager(storage);
    const accounts = manager.fetchAccounts();
    expect(accounts).toHaveLength(1);
    expect(accounts[0]).toMatchObject({
      username: validHint.username,
      credentialId: validHint.credentialId,
      publicKey: validHint.publicKey,
      isImported: false,
    });
    // Auth state stays untouched: only the passkey ceremony may write it.
    // The "Continue as" default still resolves — selectDefaultAccount falls
    // back to the most recent account when no auth state exists.
    expect(manager.fetchActiveCredentialId()).toBeNull();
    expect(manager.checkAuth().isAuthenticated).toBe(false);
  });

  it('does not touch storage that already has accounts', () => {
    const storage = createMemoryStorage();
    const manager = new PasskeyManager(storage);
    manager.addAccountToList({
      username: 'existing.jaw.id',
      credentialId: 'ExistingCred',
      publicKey: '0xbeef',
      creationDate: new Date().toISOString(),
      isImported: false,
    });

    const seeded = seedAccountsFromHint(validHint, storage);

    expect(seeded).toBe(false);
    const accounts = manager.fetchAccounts();
    expect(accounts).toHaveLength(1);
    expect(accounts[0].credentialId).toBe('ExistingCred');
  });

  it('rejects malformed hints without writing anything', () => {
    const storage = createMemoryStorage();

    expect(seedAccountsFromHint(null, storage)).toBe(false);
    expect(seedAccountsFromHint({ ...validHint, username: '' }, storage)).toBe(false);
    expect(seedAccountsFromHint({ ...validHint, credentialId: '<script>' }, storage)).toBe(false);
    expect(seedAccountsFromHint({ ...validHint, publicKey: 'deadbeef' }, storage)).toBe(false);

    expect(new PasskeyManager(storage).fetchAccounts()).toHaveLength(0);
  });

  it('is idempotent for the same hint', () => {
    const storage = createMemoryStorage();

    expect(seedAccountsFromHint(validHint, storage)).toBe(true);
    expect(seedAccountsFromHint(validHint, storage)).toBe(false);

    expect(new PasskeyManager(storage).fetchAccounts()).toHaveLength(1);
  });

  it('returns false instead of throwing when storage writes fail', () => {
    // Simulates Safari private browsing / an exhausted partition quota. The
    // seed runs on the handshake path before sendPopupReady, so a throw here
    // would block connect entirely.
    const backing = createMemoryStorage();
    const failingStorage: SyncStorage = {
      getItem: <T>(key: string) => backing.getItem<T>(key),
      setItem: () => {
        throw new DOMException('QuotaExceededError');
      },
      removeItem: (key: string) => backing.removeItem(key),
    };

    expect(() => seedAccountsFromHint(validHint, failingStorage)).not.toThrow();
    expect(seedAccountsFromHint(validHint, failingStorage)).toBe(false);
  });
});
