import { describe, it, expect } from 'vitest';
import { selectDefaultAccount } from './selectDefaultAccount';
import type { LocalStorageAccount } from './types';

const acc = (username: string, credentialId: string, isoDate: string): LocalStorageAccount => ({
  username,
  credentialId,
  creationDate: new Date(isoDate),
  isImported: false,
});

describe('selectDefaultAccount', () => {
  it('returns null when there are no accounts', () => {
    expect(selectDefaultAccount([], 'cred-1')).toBeNull();
  });

  it('returns the account matching lastAuthenticatedCredentialId', () => {
    const accounts = [acc('alice', 'cred-1', '2024-01-01'), acc('bob', 'cred-2', '2024-02-01')];
    expect(selectDefaultAccount(accounts, 'cred-1')?.username).toBe('alice');
  });

  it('falls back to the most recently created account when the credentialId is stale', () => {
    const accounts = [acc('alice', 'cred-1', '2024-01-01'), acc('bob', 'cred-2', '2024-03-01')];
    expect(selectDefaultAccount(accounts, 'cred-missing')?.username).toBe('bob');
  });

  it('falls back to the most recently created account when no credentialId is given', () => {
    const accounts = [acc('alice', 'cred-1', '2024-05-01'), acc('bob', 'cred-2', '2024-03-01')];
    expect(selectDefaultAccount(accounts, undefined)?.username).toBe('alice');
    expect(selectDefaultAccount(accounts, null)?.username).toBe('alice');
  });

  it('returns the single account when only one exists', () => {
    const accounts = [acc('alice', 'cred-1', '2024-01-01')];
    expect(selectDefaultAccount(accounts, undefined)?.username).toBe('alice');
  });
});
