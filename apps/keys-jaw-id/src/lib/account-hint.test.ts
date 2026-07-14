import { describe, it, expect } from 'vitest';
import { PasskeyManager, createMemoryStorage, type SyncStorage } from '@jaw.id/core';

import { applyAccountHint } from './account-hint';

const validHint = {
  username: 'ghadi.jaw.id',
  credentialId: 'A1b2-C3d4_E5f6',
  publicKey: '0xdeadbeef',
};

/**
 * When embedded, our storage is partitioned per top-level site — wiped between
 * visits in Brave/Safari, and never updated by flows that run in the POPUP's
 * first-party world (e.g. a Safari account switch). The SDK sends the account
 * the dApp is currently connected as on the handshake; applying it ensures the
 * "Continue as" screen offers that identity — whether the partition came up
 * empty or holds a stale one. The hint touches only the account list —
 * auth state is written exclusively by a real passkey ceremony — so a forged
 * hint can never fake an authentication; it can only offer a "Continue as"
 * that fails.
 */
describe('applyAccountHint', () => {
  it('seeds the account list into empty storage without touching auth state', () => {
    const storage = createMemoryStorage();

    const applied = applyAccountHint(validHint, storage);

    expect(applied).toBe(validHint.credentialId);
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
    expect(manager.fetchActiveCredentialId()).toBeNull();
    expect(manager.checkAuth().isAuthenticated).toBe(false);
  });

  it('appends to a non-empty list without removing or replacing existing accounts', () => {
    // Safari popup-switch desync: the partition holds the OLD identity while
    // the dApp is connected as a NEW one. The hint must land in the list (so
    // it can be the "Continue as" default) while local accounts stay intact.
    const storage = createMemoryStorage();
    const manager = new PasskeyManager(storage);
    manager.addAccountToList({
      username: 'existing.jaw.id',
      credentialId: 'ExistingCred',
      publicKey: '0xbeef',
      creationDate: new Date().toISOString(),
      isImported: false,
    });

    const applied = applyAccountHint(validHint, storage);

    expect(applied).toBe(validHint.credentialId);
    const accounts = manager.fetchAccounts();
    expect(accounts).toHaveLength(2);
    expect(accounts.map((a) => a.credentialId)).toEqual(['ExistingCred', validHint.credentialId]);
  });

  it('rejects malformed hints without writing anything', () => {
    const storage = createMemoryStorage();

    expect(applyAccountHint(null, storage)).toBeNull();
    expect(applyAccountHint({ ...validHint, username: '' }, storage)).toBeNull();
    expect(applyAccountHint({ ...validHint, credentialId: '<script>' }, storage)).toBeNull();
    expect(applyAccountHint({ ...validHint, publicKey: 'deadbeef' }, storage)).toBeNull();

    expect(new PasskeyManager(storage).fetchAccounts()).toHaveLength(0);
  });

  it('is idempotent for the same hint (no duplicate list entries)', () => {
    const storage = createMemoryStorage();

    expect(applyAccountHint(validHint, storage)).toBe(validHint.credentialId);
    expect(applyAccountHint(validHint, storage)).toBe(validHint.credentialId);

    expect(new PasskeyManager(storage).fetchAccounts()).toHaveLength(1);
  });

  it('returns null instead of throwing when storage writes fail', () => {
    // Simulates Safari private browsing / an exhausted partition quota. The
    // hint is applied on the handshake path before sendPopupReady, so a throw
    // here would block connect entirely.
    const backing = createMemoryStorage();
    const failingStorage: SyncStorage = {
      getItem: <T>(key: string) => backing.getItem<T>(key),
      setItem: () => {
        throw new DOMException('QuotaExceededError');
      },
      removeItem: (key: string) => backing.removeItem(key),
    };

    expect(() => applyAccountHint(validHint, failingStorage)).not.toThrow();
    expect(applyAccountHint(validHint, failingStorage)).toBeNull();
  });
});
