/**
 * Golden vectors: our encoders against bytes produced outside TypeScript.
 *
 * toJustanAccount.encoding.test.ts round-trips what we encode back through the
 * shape we believe the contract reads. That proves we are consistent with
 * ourselves. It cannot tell us whether that shape is the audited one, because
 * both the encoder and the expectation come from this repo.
 *
 * The `expected` in these files was produced by `cast abi-encode` with the
 * struct signature copied from the Solidity, so it is the contract's own
 * statement of the encoding. See vectors/README.md for the exact commands and
 * how to re-derive any of them by hand.
 */
import { readFileSync } from 'node:fs';
import { describe, it, expect } from 'vitest';

import { wrapSignature, toWebAuthnSignature } from './toJustanAccount.js';

/** Read rather than imported, so the vectors stay plain data with no build wiring. */
function vectors<T>(name: string): T[] {
    return JSON.parse(readFileSync(new URL(`../../vectors/${name}.json`, import.meta.url), 'utf8'));
}

type WrapVector = { description: string; input: { ownerIndex: number; signature: string }; expected: string };
type WebAuthnVector = {
    description: string;
    input: { signature: string; webauthn: Record<string, unknown> };
    expected: string;
};

const wrapVectors = vectors<WrapVector>('signature-wrap');
const webauthnVectors = vectors<WebAuthnVector>('signature-webauthn');

describe('SignatureWrapper, against vectors from the contract struct', () => {
    it.each(wrapVectors)('$description', ({ input, expected }) => {
        expect(wrapSignature({ ownerIndex: input.ownerIndex, signature: input.signature as `0x${string}` })).toBe(
            expected
        );
    });
});

describe('WebAuthnAuth, against vectors from the contract struct', () => {
    it.each(webauthnVectors)('$description', ({ input, expected }) => {
        expect(
            toWebAuthnSignature({
                signature: input.signature as `0x${string}`,
                webauthn: input.webauthn as never,
            })
        ).toBe(expected);
    });
});
