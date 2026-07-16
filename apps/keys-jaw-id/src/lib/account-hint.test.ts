import { describe, it, expect, vi } from 'vitest';
import { PasskeyManager, createMemoryStorage, type SyncStorage } from '@jaw.id/core';

import { applyAccountHint } from './account-hint';

const validHint = { credentialId: 'A1b2-C3d4_E5f6' };

const serverPasskey = {
  credentialId: 'A1b2-C3d4_E5f6',
  publicKey: '0xdeadbeef' as const,
  displayName: 'ghadi.jaw.id',
};

/**
 * When embedded, our storage is partitioned per top-level site — wiped between
 * visits in Brave/Safari, and never updated by flows that run in the POPUP's
 * first-party world (e.g. a Safari account switch). The SDK sends the
 * credentialId of the account the dApp is currently connected as on the
 * handshake; applying it ensures the "Continue as" screen offers that
 * identity — whether the partition came up empty or holds a stale one. The
 * hint is a pointer only: the public key (which derives the smart account
 * address in Account.get) and the display name come from the backend
 * registry, never from the dApp-controlled hint — so a forged hint can only
 * point at a credential whose ceremony the user cannot complete. Applying
 * touches only the account list — auth state is written exclusively by a
 * real passkey ceremony.
 */
describe('applyAccountHint', () => {
  it('seeds the account list from the backend-resolved passkey without touching auth state', async () => {
    const storage = createMemoryStorage();
    const lookup = vi.fn().mockResolvedValue(serverPasskey);

    const applied = await applyAccountHint(validHint, { apiKey: 'key-1', storage, lookup });

    expect(applied).toBe(validHint.credentialId);
    expect(lookup).toHaveBeenCalledWith(validHint.credentialId, 'key-1');
    const manager = new PasskeyManager(storage);
    const accounts = manager.fetchAccounts();
    expect(accounts).toHaveLength(1);
    expect(accounts[0]).toMatchObject({
      username: serverPasskey.displayName,
      credentialId: validHint.credentialId,
      publicKey: serverPasskey.publicKey,
      isImported: false,
    });
    // Auth state stays untouched: only the passkey ceremony may write it.
    expect(manager.fetchActiveCredentialId()).toBeNull();
    expect(manager.checkAuth().isAuthenticated).toBe(false);
  });

  it('takes publicKey and username from the backend, never from a decorated hint', async () => {
    // A malicious dApp that knows the credentialId could decorate the hint
    // with its own publicKey (deriving an attacker-controlled address) or a
    // spoofed display name. Both must be ignored in favor of the backend's.
    const storage = createMemoryStorage();
    const forgedHint = {
      ...validHint,
      publicKey: '0xa77ac4e2',
      username: 'vitalik.eth',
    };

    const applied = await applyAccountHint(forgedHint, {
      storage,
      lookup: async () => serverPasskey,
    });

    expect(applied).toBe(validHint.credentialId);
    const accounts = new PasskeyManager(storage).fetchAccounts();
    expect(accounts[0].publicKey).toBe(serverPasskey.publicKey);
    expect(accounts[0].username).toBe(serverPasskey.displayName);
  });

  it('appends to a non-empty list without removing or replacing existing accounts', async () => {
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

    const applied = await applyAccountHint(validHint, { storage, lookup: async () => serverPasskey });

    expect(applied).toBe(validHint.credentialId);
    const accounts = manager.fetchAccounts();
    expect(accounts).toHaveLength(2);
    expect(accounts.map((a) => a.credentialId)).toEqual(['ExistingCred', validHint.credentialId]);
  });

  it('short-circuits an already-listed credentialId without hitting the backend', async () => {
    const storage = createMemoryStorage();
    const manager = new PasskeyManager(storage);
    manager.addAccountToList({
      username: serverPasskey.displayName,
      credentialId: validHint.credentialId,
      publicKey: serverPasskey.publicKey,
      creationDate: new Date().toISOString(),
      isImported: false,
    });
    const lookup = vi.fn().mockResolvedValue(serverPasskey);

    const applied = await applyAccountHint(validHint, { storage, lookup });

    expect(applied).toBe(validHint.credentialId);
    expect(lookup).not.toHaveBeenCalled();
    expect(manager.fetchAccounts()).toHaveLength(1);
  });

  it('rejects malformed hints without hitting the backend or writing anything', async () => {
    const storage = createMemoryStorage();
    const lookup = vi.fn().mockResolvedValue(serverPasskey);

    expect(await applyAccountHint(null, { storage, lookup })).toBeNull();
    expect(await applyAccountHint({}, { storage, lookup })).toBeNull();
    expect(await applyAccountHint({ credentialId: '<script>' }, { storage, lookup })).toBeNull();
    expect(await applyAccountHint({ credentialId: '' }, { storage, lookup })).toBeNull();

    expect(lookup).not.toHaveBeenCalled();
    expect(new PasskeyManager(storage).fetchAccounts()).toHaveLength(0);
  });

  it('is idempotent for the same hint (no duplicate list entries, one lookup)', async () => {
    const storage = createMemoryStorage();
    const lookup = vi.fn().mockResolvedValue(serverPasskey);

    expect(await applyAccountHint(validHint, { storage, lookup })).toBe(validHint.credentialId);
    expect(await applyAccountHint(validHint, { storage, lookup })).toBe(validHint.credentialId);

    expect(lookup).toHaveBeenCalledTimes(1);
    expect(new PasskeyManager(storage).fetchAccounts()).toHaveLength(1);
  });

  it('returns null when the backend lookup fails (unregistered or unreachable)', async () => {
    const storage = createMemoryStorage();

    const applied = await applyAccountHint(validHint, {
      storage,
      lookup: () => Promise.reject(new Error('Passkey not found')),
    });

    expect(applied).toBeNull();
    expect(new PasskeyManager(storage).fetchAccounts()).toHaveLength(0);
  });

  it('returns null when the backend lookup hangs past the timeout', async () => {
    // A hung lookup must not wedge the dialog: checkForPasskeys waits on the
    // apply, so it has to settle — degrading to the no-hint experience.
    const storage = createMemoryStorage();

    const applied = await applyAccountHint(validHint, {
      storage,
      lookup: () => new Promise(() => undefined),
      timeoutMs: 10,
    });

    expect(applied).toBeNull();
    expect(new PasskeyManager(storage).fetchAccounts()).toHaveLength(0);
  });

  it('returns null instead of throwing when storage writes fail', async () => {
    // Simulates Safari private browsing / an exhausted partition quota. The
    // hint is applied on the handshake path, so a throw here would block
    // connect entirely.
    const backing = createMemoryStorage();
    const failingStorage: SyncStorage = {
      getItem: <T>(key: string) => backing.getItem<T>(key),
      setItem: () => {
        throw new DOMException('QuotaExceededError');
      },
      removeItem: (key: string) => backing.removeItem(key),
    };
    const lookup = () => Promise.resolve(serverPasskey);

    await expect(applyAccountHint(validHint, { storage: failingStorage, lookup })).resolves.toBeNull();
  });
});
