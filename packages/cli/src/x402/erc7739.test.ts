import { describe, it, expect } from 'vitest';
import { hashTypedData, hashDomain, getTypesForEIP712Domain, sliceHex, hexToNumber } from 'viem';
import { erc7739Digest, wrapErc7739Signature, contentsHashOf } from './erc7739.js';
import type { ExactTypedData } from './scheme-exact-evm.js';
import { TRANSFER_WITH_AUTHORIZATION_TYPES } from './scheme-exact-evm.js';

const typedData: ExactTypedData = {
  domain: {
    name: 'USDC',
    version: '2',
    chainId: 84532,
    verifyingContract: '0x036CbD53842c5426634e7929541eC2318f3dCF7e',
  },
  types: TRANSFER_WITH_AUTHORIZATION_TYPES,
  primaryType: 'TransferWithAuthorization',
  message: {
    from: '0x9fD37D2cF1b32b3f7dBae480bbd44BE3De2A9e0F',
    to: '0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC',
    value: 1000n,
    validAfter: 0n,
    validBefore: 1_800_000_000n,
    nonce: ('0x' + '11'.repeat(32)) as `0x${string}`,
  },
};

const accountDomain = {
  name: 'JustanAccount',
  version: '1',
  chainId: 84532n,
  verifyingContract: '0x9fD37D2cF1b32b3f7dBae480bbd44BE3De2A9e0F' as `0x${string}`,
  salt: ('0x' + '00'.repeat(32)) as `0x${string}`,
};

describe('erc7739Digest', () => {
  it('matches an independent viem hashTypedData construction of the TypedDataSign envelope', () => {
    const { digest } = erc7739Digest(typedData, accountDomain);

    // Independent computation: viem hashes the envelope under the APP (USDC)
    // domain, with the account domain flattened into the TypedDataSign struct.
    const expected = hashTypedData({
      domain: typedData.domain,
      types: {
        TypedDataSign: [
          { name: 'contents', type: 'TransferWithAuthorization' },
          { name: 'name', type: 'string' },
          { name: 'version', type: 'string' },
          { name: 'chainId', type: 'uint256' },
          { name: 'verifyingContract', type: 'address' },
          { name: 'salt', type: 'bytes32' },
        ],
        TransferWithAuthorization: [...TRANSFER_WITH_AUTHORIZATION_TYPES.TransferWithAuthorization],
      },
      primaryType: 'TypedDataSign',
      message: {
        contents: typedData.message,
        name: accountDomain.name,
        version: accountDomain.version,
        chainId: accountDomain.chainId,
        verifyingContract: accountDomain.verifyingContract,
        salt: accountDomain.salt,
      },
    });

    expect(digest).toBe(expected);
  });

  it('differs from the bare (unwrapped) EIP-3009 digest', () => {
    const { digest } = erc7739Digest(typedData, accountDomain);
    const bare = hashTypedData(typedData as never);
    expect(digest).not.toBe(bare);
  });

  it('returns the app domain separator and contents hash used in the blob', () => {
    const { appDomainSeparator, contentsHash } = erc7739Digest(typedData, accountDomain);
    const expectedSep = hashDomain({
      domain: typedData.domain,
      types: { EIP712Domain: getTypesForEIP712Domain({ domain: typedData.domain }) },
    } as never);
    expect(appDomainSeparator).toBe(expectedSep);
    expect(contentsHash).toBe(contentsHashOf(typedData.message));
  });
});

describe('wrapErc7739Signature', () => {
  it('lays out sig ‖ appSep ‖ contentsHash ‖ contentsType ‖ uint16 length', () => {
    const sig = ('0x' + 'ab'.repeat(65)) as `0x${string}`;
    const { appDomainSeparator, contentsHash } = erc7739Digest(typedData, accountDomain);
    const wrapped = wrapErc7739Signature(sig, appDomainSeparator, contentsHash);

    const total = (wrapped.length - 2) / 2;
    expect(sliceHex(wrapped, 0, 65)).toBe(sig);
    expect(sliceHex(wrapped, 65, 97)).toBe(appDomainSeparator);
    expect(sliceHex(wrapped, 97, 129)).toBe(contentsHash);
    // Trailing uint16 = byte length of the contents type string.
    const typeLen = hexToNumber(sliceHex(wrapped, total - 2, total));
    expect(typeLen).toBe(total - 65 - 32 - 32 - 2);
    // Implicit mode: the description IS the contents type, name first.
    const typeStr = Buffer.from(wrapped.slice(2 + 129 * 2, -4), 'hex').toString();
    expect(typeStr.startsWith('TransferWithAuthorization(')).toBe(true);
  });
});
