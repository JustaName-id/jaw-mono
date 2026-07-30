import { describe, expect, it } from 'vitest';
import { resolveEip712Descriptor, eip712TypeHash } from './eip712';
import { caip10 } from './source';

/* eslint-disable @typescript-eslint/no-explicit-any */
// Imports the resolver directly (core-free) — enabled by the module split.

const USDC = '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48';

const TYPES = {
  EIP712Domain: [
    { name: 'name', type: 'string' },
    { name: 'version', type: 'string' },
    { name: 'chainId', type: 'uint256' },
    { name: 'verifyingContract', type: 'address' },
  ],
  Permit: [
    { name: 'owner', type: 'address' },
    { name: 'spender', type: 'address' },
    { name: 'value', type: 'uint256' },
    { name: 'nonce', type: 'uint256' },
    { name: 'deadline', type: 'uint256' },
  ],
};
const DOMAIN = { name: 'USD Coin', version: '2', chainId: 1, verifyingContract: USDC };
const PERMIT_KEY = 'Permit(address owner,address spender,uint256 value,uint256 nonce,uint256 deadline)';

const makeSource = (index: unknown, files: Record<string, unknown>) =>
  ({
    getCalldataIndex: async () => ({}),
    getEip712Index: async () => index,
    getDescriptor: async (p: string) => {
      if (!(p in files)) throw new Error(`404 ${p}`);
      return JSON.parse(JSON.stringify(files[p]));
    },
  }) as any;

describe('resolveEip712Descriptor', () => {
  it('resolves an includes-based Permit descriptor via typehash + domain match', async () => {
    const hash = eip712TypeHash(TYPES, 'Permit')!;
    const index = { [caip10(1, USDC)]: { Permit: [{ path: 'registry/permit/usdc.json', encodeTypeHashes: [hash] }] } };
    const files = {
      'registry/permit/usdc.json': {
        includes: '../../ercs/permit.json',
        context: {
          eip712: { deployments: [{ chainId: 1, address: USDC }], domain: { name: 'USD Coin', version: '2' } },
        },
      },
      'ercs/permit.json': {
        display: { formats: { [PERMIT_KEY]: { intent: 'Authorize spending of tokens', fields: [] } } },
      },
    };
    const match = await resolveEip712Descriptor(makeSource(index, files), 1, USDC, 'Permit', TYPES, DOMAIN);
    expect(match).not.toBeNull();
    expect(match!.formatKey).toBe(PERMIT_KEY);
    expect(match!.format.intent).toBe('Authorize spending of tokens');
  });

  it('refuses when no candidate typehash matches (prevents mislabelling a lookalike struct)', async () => {
    const index = { [caip10(1, USDC)]: { Permit: [{ path: 'x.json', encodeTypeHashes: [`0x${'de'.repeat(32)}`] }] } };
    const files = { 'x.json': { display: { formats: { [PERMIT_KEY]: {} } } } };
    const match = await resolveEip712Descriptor(makeSource(index, files), 1, USDC, 'Permit', TYPES, DOMAIN);
    expect(match).toBeNull();
  });

  it('refuses on a domain version mismatch (stale-descriptor guard)', async () => {
    const hash = eip712TypeHash(TYPES, 'Permit')!;
    const index = { [caip10(1, USDC)]: { Permit: [{ path: 'x.json', encodeTypeHashes: [hash] }] } };
    const files = {
      'x.json': {
        context: {
          eip712: { deployments: [{ chainId: 1, address: USDC }], domain: { name: 'USD Coin', version: '99' } },
        },
        display: { formats: { [PERMIT_KEY]: {} } },
      },
    };
    const match = await resolveEip712Descriptor(makeSource(index, files), 1, USDC, 'Permit', TYPES, DOMAIN);
    expect(match).toBeNull();
  });

  it('returns null when the contract has no descriptor', async () => {
    const match = await resolveEip712Descriptor(makeSource({}, {}), 1, USDC, 'Permit', TYPES, DOMAIN);
    expect(match).toBeNull();
  });
});
