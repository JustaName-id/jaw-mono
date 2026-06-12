import { afterEach, describe, expect, it, vi } from 'vitest';
import { reverseResolveWithAvatars } from './reverseResolve';

/** Build a reverse API response body for one address/name with optional text records. */
function reverseBody(address: string, name: string, texts?: { key: string; value: string }[]) {
  return {
    result: {
      data: {
        address,
        name,
        records: texts ? { records: { texts } } : null,
      },
    },
  };
}

function stubFetch(body: unknown) {
  const mockFetch = vi.fn().mockResolvedValue({ ok: true, json: async () => body });
  vi.stubGlobal('fetch', mockFetch);
  return mockFetch;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('reverseResolveWithAvatars', () => {
  it('routes a name with an avatar record through the ENS metadata proxy (never the raw record URL)', async () => {
    stubFetch(
      reverseBody('0xfAbc9dDe6d43b39E087122A80f05E80615110b65', 'ghadi20.justan.id', [
        { key: 'avatar', value: 'https://cdn.justaname.id/avatar/ghadi.justan.id.png' },
      ])
    );

    const result = await reverseResolveWithAvatars(
      [{ address: '0xfAbc9dDe6d43b39E087122A80f05E80615110b65', chainId: 1 }],
      'http://rpc.test'
    );

    expect(result['0xfabc9dde6d43b39e087122a80f05e80615110b65']).toEqual({
      name: 'ghadi20.justan.id',
      avatar: 'https://metadata.ens.domains/mainnet/avatar/ghadi20.justan.id',
    });
  });

  it('omits avatar when the name has no avatar record', async () => {
    stubFetch(
      reverseBody('0xfAbc9dDe6d43b39E087122A80f05E80615110b65', 'ghadi20.justan.id', [
        { key: 'email', value: 'ghadi@justalab.co' },
      ])
    );

    const result = await reverseResolveWithAvatars(
      [{ address: '0xfAbc9dDe6d43b39E087122A80f05E80615110b65', chainId: 1 }],
      'http://rpc.test'
    );

    expect(result['0xfabc9dde6d43b39e087122a80f05e80615110b65'].avatar).toBeUndefined();
  });

  it('URL-encodes the name segment in the proxy URL', async () => {
    stubFetch(
      reverseBody('0x00000000000000000000000000000000000000aa', '🦊.justan.id', [
        { key: 'avatar', value: 'ipfs://whatever' },
      ])
    );

    const result = await reverseResolveWithAvatars(
      [{ address: '0x00000000000000000000000000000000000000aa', chainId: 1 }],
      'http://rpc.test'
    );

    expect(result['0x00000000000000000000000000000000000000aa'].avatar).toBe(
      `https://metadata.ens.domains/mainnet/avatar/${encodeURIComponent('🦊.justan.id')}`
    );
  });
});
