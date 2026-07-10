import { describe, it, expect } from 'vitest';
import { PasskeyManager, createMemoryStorage } from '@jaw.id/core';

import { seedAccountsFromHint } from './account-hint';

const validHint = {
  address: '0x1234567890abcdef1234567890abcdef12345678',
  username: 'ghadi.jaw.id',
  credentialId: 'A1b2-C3d4_E5f6',
  publicKey: '0xdeadbeef',
};

/**
 * When embedded, our storage is partitioned per top-level site — and wiped
 * between visits in Brave/Safari. The SDK sends back the last connected
 * account on the handshake; seeding it restores the "Continue as" screen.
 * Continuing still runs the full passkey ceremony, so a forged hint can never
 * fake an authentication — it can only offer a "Continue as" that fails.
 */
describe('seedAccountsFromHint', () => {
  it('seeds the account list and auth state into empty storage', () => {
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
    // The seeded account is the "Continue as" default
    expect(manager.fetchActiveCredentialId()).toBe(validHint.credentialId);
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
    // Auth state untouched (was never set)
    expect(manager.fetchActiveCredentialId()).toBeNull();
  });

  it('rejects malformed hints without writing anything', () => {
    const storage = createMemoryStorage();

    expect(seedAccountsFromHint(null, storage)).toBe(false);
    expect(seedAccountsFromHint({ ...validHint, address: 'nope' }, storage)).toBe(false);
    expect(seedAccountsFromHint({ ...validHint, credentialId: '<script>' }, storage)).toBe(false);

    expect(new PasskeyManager(storage).fetchAccounts()).toHaveLength(0);
  });

  it('is idempotent for the same hint', () => {
    const storage = createMemoryStorage();

    expect(seedAccountsFromHint(validHint, storage)).toBe(true);
    expect(seedAccountsFromHint(validHint, storage)).toBe(false);

    expect(new PasskeyManager(storage).fetchAccounts()).toHaveLength(1);
  });
});
