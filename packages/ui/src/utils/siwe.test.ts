import { describe, expect, it } from 'vitest';
import { isSiweMessage, parseSiweMessage, getSiweOriginWarning } from './siwe';

const ADDRESS = '0x6270000000000000000000000000000000003847';

function siwe(parts: {
  domain?: string;
  address?: string;
  statement?: string;
  uri?: string;
  version?: string;
  chainId?: string;
  nonce?: string;
  issuedAt?: string;
  extra?: string;
}): string {
  const {
    domain = 'app.example',
    address = ADDRESS,
    statement,
    uri = 'https://app.example',
    version = '1',
    chainId = '1',
    nonce = 'abc12345',
    issuedAt = '2026-01-01T00:00:00.000Z',
    extra = '',
  } = parts;
  const head = `${domain} wants you to sign in with your Ethereum account:\n${address}\n\n`;
  const body = statement ? `${statement}\n\n` : '';
  const fields =
    `URI: ${uri}\nVersion: ${version}\nChain ID: ${chainId}\nNonce: ${nonce}\nIssued At: ${issuedAt}` + extra;
  return head + body + fields;
}

describe('isSiweMessage', () => {
  it('accepts a well-formed SIWE message', () => {
    expect(isSiweMessage(siwe({}))).toBe(true);
  });

  it('rejects a plain personal_sign message', () => {
    expect(isSiweMessage('Hello, World!')).toBe(false);
  });

  it('accepts a short/weak nonce (so the dialog can flag it, not fall back to plain sign)', () => {
    expect(isSiweMessage(siwe({ nonce: '1234' }))).toBe(true);
  });
});

describe('parseSiweMessage', () => {
  it('extracts the core fields', () => {
    const p = parseSiweMessage(siwe({ chainId: '8453', nonce: 'deadbeef99' }))!;
    expect(p.domain).toBe('app.example');
    expect(p.address).toBe(ADDRESS);
    expect(p.uri).toBe('https://app.example');
    expect(p.version).toBe('1');
    expect(p.chainId).toBe(8453);
    expect(p.nonce).toBe('deadbeef99');
    expect(p.issuedAt).toBe('2026-01-01T00:00:00.000Z');
  });

  it('captures the statement', () => {
    const p = parseSiweMessage(siwe({ statement: 'Sign in to Example.' }))!;
    expect(p.statement).toBe('Sign in to Example.');
  });

  it('parses expiration and resources', () => {
    const p = parseSiweMessage(
      siwe({
        extra:
          '\nExpiration Time: 2036-01-01T00:00:00.000Z\nResources:\n- https://app.example/scope/read\n- https://app.example/scope/write',
      })
    )!;
    expect(p.expirationTime).toBe('2036-01-01T00:00:00.000Z');
    expect(p.resources).toEqual(['https://app.example/scope/read', 'https://app.example/scope/write']);
  });

  // The regression this suite exists for: a dApp must NOT be able to spoof the
  // displayed URI/Chain ID by embedding those tokens in the free-text statement.
  it('does not let a statement spoof the URI or chain id', () => {
    const p = parseSiweMessage(
      siwe({
        statement: 'Trust me. URI: https://evil.example Chain ID: 999',
        uri: 'https://app.example',
        chainId: '1',
      })
    )!;
    expect(p.uri).toBe('https://app.example');
    expect(p.chainId).toBe(1);
    expect(p.statement).toContain('evil.example');
  });

  it('returns null for a non-SIWE message', () => {
    expect(parseSiweMessage('Hello, World!')).toBeNull();
  });
});

describe('getSiweOriginWarning', () => {
  it('warns when the SIWE domain differs from the request origin', () => {
    const warning = getSiweOriginWarning('https://app.example', { domain: 'bank.com', uri: 'https://bank.com' });
    expect(warning).toContain('bank.com');
    expect(warning).toContain('app.example');
  });

  it('is silent when the hosts match', () => {
    expect(getSiweOriginWarning('https://app.example', { domain: 'app.example' })).toBeUndefined();
  });

  it('falls back to the uri host when domain is absent', () => {
    expect(getSiweOriginWarning('https://app.example', { uri: 'https://evil.example' })).toContain('evil.example');
  });

  it('is silent (fails open) when nothing is comparable', () => {
    expect(getSiweOriginWarning('https://app.example', {})).toBeUndefined();
  });
});
