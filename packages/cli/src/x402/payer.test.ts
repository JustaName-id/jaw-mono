import { describe, it, expect, vi, beforeEach } from 'vitest';
import { privateKeyToAccount } from 'viem/accounts';
import { recoverTypedDataAddress, recoverAddress, sliceHex } from 'viem';
import type { X402PaymentRequirement } from './types.js';
import { TRANSFER_WITH_AUTHORIZATION_TYPES } from './scheme-exact-evm.js';
import { erc7739Digest } from './erc7739.js';

// Well-known Hardhat test key #1 — never used for real funds.
const PK = '0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d';
const account = privateKeyToAccount(PK);

vi.mock('../lib/keystore.js', () => ({
  keystoreExists: vi.fn(() => true),
  loadSessionKey: vi.fn(() => PK),
}));

const getCodeMock = vi.fn();
const readContractMock = vi.fn();
vi.mock('./balance.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./balance.js')>();
  return {
    ...actual,
    publicClientFor: () => ({ getCode: getCodeMock, readContract: readContractMock }),
  };
});

const { Eip3009EoaPayer } = await import('./payer.js');

const requirement: X402PaymentRequirement = {
  scheme: 'exact',
  network: 'eip155:84532',
  amount: '1000',
  asset: '0x036CbD53842c5426634e7929541eC2318f3dCF7e',
  payTo: '0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC',
  maxTimeoutSeconds: 60,
};

const ACCOUNT_DOMAIN_TUPLE = [
  '0x0f',
  'JustanAccount',
  '1',
  84532n,
  account.address,
  ('0x' + '00'.repeat(32)) as `0x${string}`,
  [],
];

beforeEach(() => {
  getCodeMock.mockReset();
  readContractMock.mockReset();
});

describe('Eip3009EoaPayer delegation awareness', () => {
  it('signs the plain typed data while the EOA has no code (ecrecover path)', async () => {
    getCodeMock.mockResolvedValue(undefined);
    const payer = Eip3009EoaPayer.fromSessionKey();

    const payload = await payer.pay(requirement, { now: 1_000_000, nonce: ('0x' + '11'.repeat(32)) as `0x${string}` });

    const sig = payload.payload.signature;
    expect((sig.length - 2) / 2).toBe(65);
    const recovered = await recoverTypedDataAddress({
      domain: { name: 'USDC', version: '2', chainId: 84532, verifyingContract: requirement.asset },
      types: TRANSFER_WITH_AUTHORIZATION_TYPES,
      primaryType: 'TransferWithAuthorization',
      message: {
        from: account.address,
        to: requirement.payTo,
        value: 1000n,
        validAfter: 0n,
        validBefore: BigInt(1_000_000 + 600),
        nonce: ('0x' + '11'.repeat(32)) as `0x${string}`,
      },
      signature: sig,
    });
    expect(recovered.toLowerCase()).toBe(account.address.toLowerCase());
  });

  it('signs the ERC-7739 wrapped envelope once the EOA carries the 7702 designator', async () => {
    getCodeMock.mockResolvedValue('0xef0100bb4f7d5418cd8dadb61bb95561179e517572cbcd');
    readContractMock.mockResolvedValue(ACCOUNT_DOMAIN_TUPLE);
    const payer = Eip3009EoaPayer.fromSessionKey();

    const payload = await payer.pay(requirement, { now: 1_000_000, nonce: ('0x' + '11'.repeat(32)) as `0x${string}` });

    const sig = payload.payload.signature;
    expect((sig.length - 2) / 2).toBeGreaterThan(65); // wrapped blob, not a bare sig
    expect(readContractMock).toHaveBeenCalledWith(
      expect.objectContaining({ address: account.address, functionName: 'eip712Domain' })
    );
    // The inner 65-byte signature recovers to the EOA over the envelope digest.
    const { digest } = erc7739Digest(
      {
        domain: { name: 'USDC', version: '2', chainId: 84532, verifyingContract: requirement.asset },
        types: TRANSFER_WITH_AUTHORIZATION_TYPES,
        primaryType: 'TransferWithAuthorization',
        message: {
          from: account.address,
          to: requirement.payTo,
          value: 1000n,
          validAfter: 0n,
          validBefore: BigInt(1_000_000 + 600),
          nonce: ('0x' + '11'.repeat(32)) as `0x${string}`,
        },
      },
      {
        name: 'JustanAccount',
        version: '1',
        chainId: 84532n,
        verifyingContract: account.address,
        salt: ('0x' + '00'.repeat(32)) as `0x${string}`,
      }
    );
    const recovered = await recoverAddress({ hash: digest, signature: sliceHex(sig, 0, 65) });
    expect(recovered.toLowerCase()).toBe(account.address.toLowerCase());
  });

  it('caches the account domain across payments (one eip712Domain read)', async () => {
    getCodeMock.mockResolvedValue('0xef0100bb4f7d5418cd8dadb61bb95561179e517572cbcd');
    readContractMock.mockResolvedValue(ACCOUNT_DOMAIN_TUPLE);
    const payer = Eip3009EoaPayer.fromSessionKey();

    await payer.pay(requirement);
    await payer.pay(requirement);

    expect(readContractMock).toHaveBeenCalledTimes(1);
  });

  it('falls back to the raw signature when the code check is unreachable', async () => {
    getCodeMock.mockRejectedValue(new Error('rpc down'));
    const payer = Eip3009EoaPayer.fromSessionKey();

    const payload = await payer.pay(requirement);

    expect((payload.payload.signature.length - 2) / 2).toBe(65);
  });
});
