import { describe, it, expect } from 'vitest';

import { isSilentContinueAsConnect } from './continue-as-connect';

const base = {
  isEmbedded: true,
  hintedCredentialId: 'cred-1',
  authenticatedCredentialId: 'cred-1',
  params: [] as unknown[],
};

describe('isSilentContinueAsConnect', () => {
  it('approves silently when the user continues as the account the dApp is already connected as', () => {
    expect(isSilentContinueAsConnect(base)).toBe(true);
  });

  it('accepts wallet_connect params without capabilities', () => {
    expect(isSilentContinueAsConnect({ ...base, params: [{}] })).toBe(true);
    expect(isSilentContinueAsConnect({ ...base, params: [{ capabilities: {} }] })).toBe(true);
  });

  it('keeps the Connect screen outside the embedded context', () => {
    expect(isSilentContinueAsConnect({ ...base, isEmbedded: false })).toBe(false);
  });

  it('keeps the Connect screen when there is no hint (first connect / lookup failed)', () => {
    expect(isSilentContinueAsConnect({ ...base, hintedCredentialId: null })).toBe(false);
  });

  it('keeps the Connect screen when the user picked a different account than the hint', () => {
    expect(isSilentContinueAsConnect({ ...base, authenticatedCredentialId: 'cred-2' })).toBe(false);
  });

  it('keeps the signing screen for SIWE-capability connects (a signature is required)', () => {
    expect(
      isSilentContinueAsConnect({
        ...base,
        params: [{ capabilities: { signInWithEthereum: { nonce: 'n', chainId: '0x1' } } }],
      })
    ).toBe(false);
  });
});
