import { describe, expect, it } from 'vitest';
import { hashDomain, hashStruct, hashTypedData } from 'viem';
import { computeCalldataDigest, computeEip712Digests } from './erc8213';

// Canonical EIP-712 "Ether Mail" example from the EIP-712 specification.
// Its digest / domain-separator / message hash are well-known reference values,
// independent of any one library's implementation.
const ETHER_MAIL = {
  types: {
    EIP712Domain: [
      { name: 'name', type: 'string' },
      { name: 'version', type: 'string' },
      { name: 'chainId', type: 'uint256' },
      { name: 'verifyingContract', type: 'address' },
    ],
    Person: [
      { name: 'name', type: 'string' },
      { name: 'wallet', type: 'address' },
    ],
    Mail: [
      { name: 'from', type: 'Person' },
      { name: 'to', type: 'Person' },
      { name: 'contents', type: 'string' },
    ],
  },
  primaryType: 'Mail',
  domain: {
    name: 'Ether Mail',
    version: '1',
    chainId: 1,
    verifyingContract: '0xCcCCccccCCCCcCCCCCCcCcCccCcCCCcCcccccccC',
  },
  message: {
    from: { name: 'Cow', wallet: '0xCD2a3d9F938E13CD947Ec05AbC7FE734Df8DD826' },
    to: { name: 'Bob', wallet: '0xbBbBBBBbbBBBbbbBbbBbbbbBBbBbbbbBbBbbBBbB' },
    contents: 'Hello, Bob!',
  },
} as const;

// Reference values from the EIP-712 specification's example implementation.
const KNOWN_EIP712_DIGEST = '0xbe609aee343fb3c4b28e1df9e632fca64fcfaede20f02e86244efddf30957bd2';
const KNOWN_DOMAIN_HASH = '0xf2cee375fa42b42143804025fc449deafd50cc031ca257e0b194a650a912090f';
const KNOWN_MESSAGE_HASH = '0xc52c0ee5d84264471806290a3f2c4cecfc5490626bf912d01f240d7a274b371e';

describe('computeEip712Digests', () => {
  it('computes the EIP-712 Digest matching the known reference value', () => {
    const { eip712Digest } = computeEip712Digests(JSON.stringify(ETHER_MAIL));
    expect(eip712Digest).toBe(KNOWN_EIP712_DIGEST);
  });

  it('computes the Domain Hash matching the known reference value', () => {
    const { domainHash } = computeEip712Digests(JSON.stringify(ETHER_MAIL));
    expect(domainHash).toBe(KNOWN_DOMAIN_HASH);
  });

  it('computes the Message Hash matching the known reference value', () => {
    const { messageHash } = computeEip712Digests(JSON.stringify(ETHER_MAIL));
    expect(messageHash).toBe(KNOWN_MESSAGE_HASH);
  });

  it('the EIP-712 Digest equals viem hashTypedData() for the same typed data', () => {
    const { eip712Digest } = computeEip712Digests(JSON.stringify(ETHER_MAIL));
    expect(eip712Digest).toBe(hashTypedData(ETHER_MAIL));
  });

  it('agrees with viem hashDomain() and hashStruct() for the components', () => {
    const { domainHash, messageHash } = computeEip712Digests(JSON.stringify(ETHER_MAIL));
    expect(domainHash).toBe(hashDomain({ domain: ETHER_MAIL.domain, types: ETHER_MAIL.types }));
    expect(messageHash).toBe(
      hashStruct({ data: ETHER_MAIL.message, primaryType: ETHER_MAIL.primaryType, types: ETHER_MAIL.types })
    );
  });

  it('computes the Message Hash with EIP712Domain stripped from the types map', () => {
    // hashStruct(message) must encode only the message's own struct graph. The
    // canonical reference value is computed over types WITHOUT EIP712Domain, so a
    // correct Message Hash equals hashStruct over the stripped map and never
    // depends on EIP712Domain being present.
    const strippedTypes = { Person: ETHER_MAIL.types.Person, Mail: ETHER_MAIL.types.Mail };
    const { messageHash } = computeEip712Digests(JSON.stringify(ETHER_MAIL));
    expect(messageHash).toBe(
      hashStruct({ data: ETHER_MAIL.message, primaryType: ETHER_MAIL.primaryType, types: strippedTypes })
    );
    expect(messageHash).toBe(KNOWN_MESSAGE_HASH);
  });

  it('emits lowercase hex for all three digests', () => {
    const all = computeEip712Digests(JSON.stringify(ETHER_MAIL));
    for (const v of Object.values(all)) {
      expect(v).toBe(v.toLowerCase());
      expect(v.startsWith('0x')).toBe(true);
    }
  });

  it('derives the EIP712Domain type when the typed data omits it', () => {
    const typesWithoutDomain = { Person: ETHER_MAIL.types.Person, Mail: ETHER_MAIL.types.Mail };
    const json = JSON.stringify({ ...ETHER_MAIL, types: typesWithoutDomain });
    const { eip712Digest, domainHash } = computeEip712Digests(json);
    expect(eip712Digest).toBe(KNOWN_EIP712_DIGEST);
    expect(domainHash).toBe(KNOWN_DOMAIN_HASH);
  });

  it('throws on invalid JSON', () => {
    expect(() => computeEip712Digests('{not json')).toThrow();
  });
});

describe('computeCalldataDigest', () => {
  // Length-prefixed formula: keccak256( uint256(len(calldata)) ‖ calldata ).
  // Expected values computed independently with Foundry's `cast keccak`:
  //   cast keccak 0x000...0004 12345678
  //   cast keccak 0x000...0001 ab
  it('matches the hand-computed vector for 4-byte calldata', () => {
    expect(computeCalldataDigest('0x12345678')).toBe(
      '0xbca53a900ee1cecffba8d1933d6c15917fb88cfd4043fde14e01d1bcf03d38d4'
    );
  });

  it('matches the hand-computed vector for 1-byte calldata', () => {
    expect(computeCalldataDigest('0xab')).toBe('0xba1a0c896d43de280bfa57f34498c97fc96b63d7b81a1147e575e208e04e069d');
  });
});
