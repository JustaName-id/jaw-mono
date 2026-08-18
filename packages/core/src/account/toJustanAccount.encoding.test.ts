/**
 * The four functions in `toJustanAccount` that turn values into bytes a
 * contract decodes: `wrapSignature`, `toWebAuthnSignature`, and the two signing
 * helpers that wrap them.
 *
 * Separate from toJustanAccount.test.ts on purpose. That file mocks the client
 * and the account-abstraction seams, which is right for testing the factory.
 * These four have no seams worth mocking: their whole job is the byte string,
 * so viem and ox run for real here and every assertion is on the output.
 *
 * The round-trips are what make this meaningful. Asserting which arguments went
 * into `encodeAbiParameters` only mirrors the implementation, and a reordered
 * tuple field moves both sides together while `abi.decode` on chain breaks.
 * Decoding what we produced, with the shape written out independently, does not
 * move with it.
 */
import { decodeAbiParameters, parseSignature, size, type Hex } from 'viem';
import { describe, it, expect, vi } from 'vitest';

import { wrapSignature, toWebAuthnSignature, sign, signTypedData } from './toJustanAccount.js';

/** The tuple `JustanAccount` decodes a wrapped signature into. */
const WRAPPED_SIGNATURE = [
    {
        type: 'tuple',
        components: [
            { name: 'ownerIndex', type: 'uint8' },
            { name: 'signatureData', type: 'bytes' },
        ],
    },
] as const;

/** The tuple the contract decodes a WebAuthn signature into. */
const WEBAUTHN_SIGNATURE = [
    {
        type: 'tuple',
        components: [
            { name: 'authenticatorData', type: 'bytes' },
            { name: 'clientDataJSON', type: 'bytes' },
            { name: 'challengeIndex', type: 'uint256' },
            { name: 'typeIndex', type: 'uint256' },
            { name: 'r', type: 'bytes32' },
            { name: 's', type: 'bytes32' },
        ],
    },
] as const;

/** A real P-256 signature, 64 bytes of r and s. */
const P256_SIGNATURE = `0x${'11'.repeat(32)}${'22'.repeat(32)}` as Hex;

/** A real secp256k1 signature, 65 bytes with the recovery byte last. */
const SECP256K1_SIGNATURE = `0x${'aa'.repeat(32)}${'bb'.repeat(32)}1b` as Hex;

/** Taken from an actual passkey ceremony, so the lengths and offsets are real. */
const WEBAUTHN = {
    authenticatorData: '0x49960de5880e8c687434170f6476605b8fe4aeb9a28632c7995cf3ba831d97631d00000000' as Hex,
    clientDataJSON:
        '{"type":"webauthn.get","challenge":"9jEFijuhEWrM4SOW-tChJbUEHEP44VcjcJ-Bqo1fTM8","origin":"https://keys.jaw.id"}',
    // Offsets into clientDataJSON above, where the challenge and the type
    // values actually start. The contract slices at these to verify.
    challengeIndex: 35,
    typeIndex: 8,
    userVerificationRequired: true,
};

describe('wrapSignature', () => {
    it('encodes the tuple the contract decodes, in that field order', () => {
        const out = wrapSignature({ ownerIndex: 3, signature: P256_SIGNATURE });

        const [decoded] = decodeAbiParameters(WRAPPED_SIGNATURE, out);
        expect(decoded.ownerIndex).toBe(3);
        expect(decoded.signatureData).toBe(P256_SIGNATURE);
    });

    it('defaults to owner index 0', () => {
        const [decoded] = decodeAbiParameters(WRAPPED_SIGNATURE, wrapSignature({ signature: P256_SIGNATURE }));
        expect(decoded.ownerIndex).toBe(0);
    });

    it.each([
        ['1b', '1b'],
        ['1c', '1c'],
        ['00', '1b'],
        ['01', '1c'],
    ])('repacks a 65-byte signature, normalising v %s to %s', (given, expected) => {
        // Both spellings of the recovery byte reach us: 27/28 from a wallet,
        // 0/1 from a raw yParity. The contract only accepts 27 or 28.
        const sig = `0x${'aa'.repeat(32)}${'bb'.repeat(32)}${given}` as Hex;
        const [decoded] = decodeAbiParameters(WRAPPED_SIGNATURE, wrapSignature({ signature: sig }));

        expect(size(decoded.signatureData)).toBe(65);
        const { r, s } = parseSignature(decoded.signatureData);
        expect(r).toBe(`0x${'aa'.repeat(32)}`);
        expect(s).toBe(`0x${'bb'.repeat(32)}`);
        expect(decoded.signatureData.slice(-2)).toBe(expected);
    });

    it('passes a signature of any other length through untouched', () => {
        // Only the 65-byte case is repacked. A WebAuthn blob is much longer and
        // must arrive at the contract exactly as produced.
        const blob = `0x${'cd'.repeat(200)}` as Hex;
        const [decoded] = decodeAbiParameters(WRAPPED_SIGNATURE, wrapSignature({ signature: blob }));
        expect(decoded.signatureData).toBe(blob);
    });
});

describe('toWebAuthnSignature', () => {
    it('encodes every field the contract reads, unchanged and in order', () => {
        const out = toWebAuthnSignature({ webauthn: WEBAUTHN, signature: P256_SIGNATURE });

        const [decoded] = decodeAbiParameters(WEBAUTHN_SIGNATURE, out);
        expect(decoded.authenticatorData).toBe(WEBAUTHN.authenticatorData);
        expect(decoded.challengeIndex).toBe(35n);
        expect(decoded.typeIndex).toBe(8n);
        // r and s are the halves of the P-256 signature, each padded to 32 bytes.
        expect(decoded.r).toBe(`0x${'11'.repeat(32)}`);
        expect(decoded.s).toBe(`0x${'22'.repeat(32)}`);
    });

    it('carries clientDataJSON as the UTF-8 bytes of the original string', () => {
        // The contract slices this at challengeIndex and typeIndex to check the
        // challenge, so any re-encoding here would move those offsets.
        const out = toWebAuthnSignature({ webauthn: WEBAUTHN, signature: P256_SIGNATURE });
        const [decoded] = decodeAbiParameters(WEBAUTHN_SIGNATURE, out);

        expect(Buffer.from(decoded.clientDataJSON.slice(2), 'hex').toString('utf8')).toBe(WEBAUTHN.clientDataJSON);
    });

    it('keeps the offsets pointing at what they claim', () => {
        const out = toWebAuthnSignature({ webauthn: WEBAUTHN, signature: P256_SIGNATURE });
        const [decoded] = decodeAbiParameters(WEBAUTHN_SIGNATURE, out);
        const json = Buffer.from(decoded.clientDataJSON.slice(2), 'hex').toString('utf8');

        expect(json.slice(Number(decoded.typeIndex))).toMatch(/^"webauthn.get"/);
        expect(json.slice(Number(decoded.challengeIndex))).toMatch(/^"9jEFijuhEWrM/);
    });

    it('pads a short r or s to a full 32 bytes', () => {
        // A P-256 scalar can have leading zero bytes. Left-padding is what keeps
        // the two bytes32 fields aligned.
        const small = `0x${'00'.repeat(31)}01${'00'.repeat(31)}02` as Hex;
        const [decoded] = decodeAbiParameters(
            WEBAUTHN_SIGNATURE,
            toWebAuthnSignature({ webauthn: WEBAUTHN, signature: small })
        );

        expect(decoded.r).toBe(`0x${'00'.repeat(31)}01`);
        expect(decoded.s).toBe(`0x${'00'.repeat(31)}02`);
    });
});

describe('sign', () => {
    it('wraps a WebAuthn owner signature into the contract tuple', async () => {
        const owner = {
            type: 'webAuthn' as const,
            sign: vi.fn().mockResolvedValue({ signature: P256_SIGNATURE, webauthn: WEBAUTHN }),
        };

        const out = await sign({ hash: `0x${'ab'.repeat(32)}`, owner: owner as never });

        expect(owner.sign).toHaveBeenCalledWith({ hash: `0x${'ab'.repeat(32)}` });
        // Not "is defined": the same bytes toWebAuthnSignature would produce.
        expect(out).toBe(toWebAuthnSignature({ webauthn: WEBAUTHN, signature: P256_SIGNATURE }));
    });

    it('returns a local account signature untouched', async () => {
        const owner = { type: 'local' as const, sign: vi.fn().mockResolvedValue(SECP256K1_SIGNATURE) };

        await expect(sign({ hash: `0x${'ab'.repeat(32)}`, owner: owner as never })).resolves.toBe(SECP256K1_SIGNATURE);
    });

    it('refuses an owner that cannot sign', async () => {
        await expect(sign({ hash: `0x${'ab'.repeat(32)}`, owner: {} as never })).rejects.toThrow(
            '`owner` does not support raw sign.'
        );
    });
});

describe('signTypedData', () => {
    const typedData = {
        domain: { name: 'JAW', version: '1', chainId: 8453 },
        types: { Test: [{ name: 'value', type: 'string' }] },
        primaryType: 'Test' as const,
        message: { value: 'hello' },
    };

    it('wraps a WebAuthn owner signature into the contract tuple', async () => {
        const owner = {
            type: 'webAuthn' as const,
            signTypedData: vi.fn().mockResolvedValue({ signature: P256_SIGNATURE, webauthn: WEBAUTHN }),
        };

        const out = await signTypedData({ typedData, owner: owner as never });

        expect(owner.signTypedData).toHaveBeenCalledWith(typedData);
        expect(out).toBe(toWebAuthnSignature({ webauthn: WEBAUTHN, signature: P256_SIGNATURE }));
    });

    it('hashes the typed data itself before handing it to a local owner', async () => {
        const owner = { type: 'local' as const, sign: vi.fn().mockResolvedValue(SECP256K1_SIGNATURE) };

        await signTypedData({ typedData, owner: owner as never });

        // The real EIP-712 digest, not whatever a stub returned. It has to be a
        // 32-byte hash and it has to change with the message.
        const [{ hash }] = owner.sign.mock.calls[0] as [{ hash: Hex }];
        expect(size(hash)).toBe(32);

        owner.sign.mockClear();
        await signTypedData({ typedData: { ...typedData, message: { value: 'other' } }, owner: owner as never });
        const [{ hash: other }] = owner.sign.mock.calls[0] as [{ hash: Hex }];
        expect(other).not.toBe(hash);
    });

    it('refuses an owner that cannot sign', async () => {
        await expect(signTypedData({ typedData, owner: {} as never })).rejects.toThrow(
            '`owner` does not support signTypedData.'
        );
    });
});
