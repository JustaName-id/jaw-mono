import { describe, it, expect, vi } from 'vitest';
import { PasskeyManager, createMemoryStorage, type SyncStorage } from '@jaw.id/core';

import { seedAccountsFromHint } from './account-hint';

const validHint = { credentialId: 'A1b2-C3d4_E5f6' };

const serverPasskey = {
  credentialId: 'A1b2-C3d4_E5f6',
  publicKey: '0xdeadbeef' as const,
  displayName: 'ghadi.jaw.id',
};

/**
 * When embedded, our storage is partitioned per top-level site — and wiped
 * between visits in Brave/Safari. The SDK sends back the last connected
 * account's credentialId on the handshake; seeding it restores the "Continue
 * as" screen. The hint is a pointer only: the public key (which derives the
 * smart account address in Account.get) and the display name come from the
 * backend registry, never from the dApp-controlled hint — so a forged hint
 * can only point at a credential whose ceremony the user cannot complete.
 * Seeding touches only the account list — auth state is written exclusively
 * by a real passkey ceremony.
 */
describe('seedAccountsFromHint', () => {
  it('seeds the account list from the backend-resolved passkey without touching auth state', async () => {
    const storage = createMemoryStorage();
    const lookup = vi.fn().mockResolvedValue(serverPasskey);

    const seeded = await seedAccountsFromHint(validHint, { apiKey: 'key-1', storage, lookup });

    expect(seeded).toBe(true);
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
    // The "Continue as" default still resolves — selectDefaultAccount falls
    // back to the most recent account when no auth state exists.
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

    const seeded = await seedAccountsFromHint(forgedHint, {
      storage,
      lookup: async () => serverPasskey,
    });

    expect(seeded).toBe(true);
    const accounts = new PasskeyManager(storage).fetchAccounts();
    expect(accounts[0].publicKey).toBe(serverPasskey.publicKey);
    expect(accounts[0].username).toBe(serverPasskey.displayName);
  });

  it('does not touch storage that already has accounts, and never hits the backend', async () => {
    const storage = createMemoryStorage();
    const manager = new PasskeyManager(storage);
    manager.addAccountToList({
      username: 'existing.jaw.id',
      credentialId: 'ExistingCred',
      publicKey: '0xbeef',
      creationDate: new Date().toISOString(),
      isImported: false,
    });
    const lookup = vi.fn().mockResolvedValue(serverPasskey);

    const seeded = await seedAccountsFromHint(validHint, { storage, lookup });

    expect(seeded).toBe(false);
    expect(lookup).not.toHaveBeenCalled();
    const accounts = manager.fetchAccounts();
    expect(accounts).toHaveLength(1);
    expect(accounts[0].credentialId).toBe('ExistingCred');
  });

  it('rejects malformed hints without hitting the backend or writing anything', async () => {
    const storage = createMemoryStorage();
    const lookup = vi.fn().mockResolvedValue(serverPasskey);

    expect(await seedAccountsFromHint(null, { storage, lookup })).toBe(false);
    expect(await seedAccountsFromHint({}, { storage, lookup })).toBe(false);
    expect(await seedAccountsFromHint({ credentialId: '<script>' }, { storage, lookup })).toBe(false);
    expect(await seedAccountsFromHint({ credentialId: '' }, { storage, lookup })).toBe(false);

    expect(lookup).not.toHaveBeenCalled();
    expect(new PasskeyManager(storage).fetchAccounts()).toHaveLength(0);
  });

  it('is idempotent for the same hint', async () => {
    const storage = createMemoryStorage();
    const lookup = () => Promise.resolve(serverPasskey);

    expect(await seedAccountsFromHint(validHint, { storage, lookup })).toBe(true);
    expect(await seedAccountsFromHint(validHint, { storage, lookup })).toBe(false);

    expect(new PasskeyManager(storage).fetchAccounts()).toHaveLength(1);
  });

  it('returns false when the backend lookup fails (unregistered or unreachable)', async () => {
    const storage = createMemoryStorage();

    const seeded = await seedAccountsFromHint(validHint, {
      storage,
      lookup: () => Promise.reject(new Error('Passkey not found')),
    });

    expect(seeded).toBe(false);
    expect(new PasskeyManager(storage).fetchAccounts()).toHaveLength(0);
  });

  it('returns false when the backend lookup hangs past the timeout', async () => {
    // A hung lookup must not wedge the dialog: checkForPasskeys waits on the
    // seed, so it has to settle — degrading to the no-hint experience.
    const storage = createMemoryStorage();

    const seeded = await seedAccountsFromHint(validHint, {
      storage,
      lookup: () => new Promise(() => undefined),
      timeoutMs: 10,
    });

    expect(seeded).toBe(false);
    expect(new PasskeyManager(storage).fetchAccounts()).toHaveLength(0);
  });

  it('returns false instead of throwing when storage writes fail', async () => {
    // Simulates Safari private browsing / an exhausted partition quota. The
    // seed runs on the handshake path, so a throw here would block connect.
    const backing = createMemoryStorage();
    const failingStorage: SyncStorage = {
      getItem: <T>(key: string) => backing.getItem<T>(key),
      setItem: () => {
        throw new DOMException('QuotaExceededError');
      },
      removeItem: (key: string) => backing.removeItem(key),
    };
    const lookup = () => Promise.resolve(serverPasskey);

    await expect(seedAccountsFromHint(validHint, { storage: failingStorage, lookup })).resolves.toBe(false);
  });
});
