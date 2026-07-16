import { describe, it, expect } from 'vitest';
import { privateKeyToAccount } from 'viem/accounts';
import { recoverTypedDataAddress } from 'viem';
import { buildExactPayment, encodePaymentPayload, TRANSFER_WITH_AUTHORIZATION_TYPES } from './scheme-exact-evm.js';
import type { X402PaymentRequirement } from './types.js';

// Well-known Hardhat test key #1 — never used for real funds.
const PK = '0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d';
const account = privateKeyToAccount(PK);
const NONCE = ('0x' + '11'.repeat(32)) as `0x${string}`;

const requirement: X402PaymentRequirement = {
  scheme: 'exact',
  network: 'eip155:84532',
  amount: '1000',
  asset: '0x036CbD53842c5426634e7929541eC2318f3dCF7e',
  payTo: '0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC',
  maxTimeoutSeconds: 60,
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const signer = (td: any) => account.signTypedData(td);

describe('buildExactPayment', () => {
  it('signs a recoverable EIP-3009 authorization for the payer', async () => {
    const payload = await buildExactPayment(requirement, account.address, signer, { now: 1_000_000, nonce: NONCE });

    expect(payload.x402Version).toBe(2);
    expect(payload.accepted).toEqual(requirement);

    const auth = payload.payload.authorization;
    expect(auth.from).toBe(account.address);
    expect(auth.to).toBe(requirement.payTo);
    expect(auth.value).toBe('1000');
    expect(auth.validAfter).toBe('0');
    expect(auth.validBefore).toBe(String(1_000_000 + 600));
    expect(auth.nonce).toBe(NONCE);

    // The signature must recover to the payer under the exact-scheme domain.
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
        nonce: NONCE,
      },
      signature: payload.payload.signature,
    });
    expect(recovered.toLowerCase()).toBe(account.address.toLowerCase());
  });

  it('prefers the server-advertised EIP-712 name/version from extra', async () => {
    const req = { ...requirement, extra: { name: 'Custom', version: '9' } };
    const payload = await buildExactPayment(req, account.address, signer, { now: 1_000_000, nonce: NONCE });

    // Recovers only under the advertised domain, proving extra was used.
    const recovered = await recoverTypedDataAddress({
      domain: { name: 'Custom', version: '9', chainId: 84532, verifyingContract: requirement.asset },
      types: TRANSFER_WITH_AUTHORIZATION_TYPES,
      primaryType: 'TransferWithAuthorization',
      message: {
        from: account.address,
        to: requirement.payTo,
        value: 1000n,
        validAfter: 0n,
        validBefore: BigInt(1_000_000 + 600),
        nonce: NONCE,
      },
      signature: payload.payload.signature,
    });
    expect(recovered.toLowerCase()).toBe(account.address.toLowerCase());
  });

  it('rejects an unsupported network', async () => {
    await expect(buildExactPayment({ ...requirement, network: 'eip155:1' }, account.address, signer)).rejects.toThrow(
      /Unsupported x402 network/
    );
  });
});

describe('encodePaymentPayload', () => {
  it('base64-encodes round-trippable JSON', async () => {
    const payload = await buildExactPayment(requirement, account.address, signer, { now: 1_000_000, nonce: NONCE });
    const decoded = JSON.parse(Buffer.from(encodePaymentPayload(payload), 'base64').toString());
    expect(decoded.accepted.payTo).toBe(requirement.payTo);
    expect(decoded.payload.signature).toBe(payload.payload.signature);
    expect(decoded.payload.authorization.nonce).toBe(NONCE);
  });
});
