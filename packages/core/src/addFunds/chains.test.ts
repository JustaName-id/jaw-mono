import { describe, expect, it } from 'vitest';
import { visibleChains } from './chains.js';
import { MAINNET_CHAINS, SUPPORTED_CHAINS, TESTNET_CHAINS } from '../account/smartAccount.js';

const FIRST = MAINNET_CHAINS[0]!.id;
const SECOND = MAINNET_CHAINS[1]!.id;
const A_TESTNET = TESTNET_CHAINS[0]!.id;
const ALL_SUPPORTED = SUPPORTED_CHAINS.map((c) => c.id);

describe('visibleChains', () => {
    it('returns the mainnets the store holds', () => {
        expect(visibleChains([{ id: FIRST }, { id: SECOND }], FIRST)).toEqual([FIRST, SECOND]);
    });

    it('drops a chain we do not support', () => {
        expect(visibleChains([{ id: FIRST }, { id: 999_999 }], FIRST)).toEqual([FIRST]);
    });

    it('dedupes, so the stack never shows the same icon twice', () => {
        expect(visibleChains([{ id: FIRST }, { id: FIRST }], FIRST)).toEqual([FIRST]);
    });

    // A testnet means nothing to someone about to send real funds, and with
    // showTestnets on the store holds every chain we support.
    it('keeps testnets out of the stack', () => {
        const visible = visibleChains(
            ALL_SUPPORTED.map((id) => ({ id })),
            FIRST
        );

        expect(visible).toEqual(MAINNET_CHAINS.map((c) => c.id));
        for (const testnet of TESTNET_CHAINS) {
            expect(visible).not.toContain(testnet.id);
        }
    });

    // The QR encodes the active chain, so a stack without it would contradict
    // the code beside it. This is the playground's default: Base Sepolia.
    it('includes the active chain even when it is a testnet, and leads with it', () => {
        const visible = visibleChains(
            ALL_SUPPORTED.map((id) => ({ id })),
            A_TESTNET
        );

        expect(visible[0]).toBe(A_TESTNET);
        expect(visible).toEqual([A_TESTNET, ...MAINNET_CHAINS.map((c) => c.id)]);
    });

    it('does not duplicate the active chain when it is already a mainnet', () => {
        const visible = visibleChains([{ id: FIRST }, { id: SECOND }], SECOND);
        expect(visible.filter((id) => id === SECOND)).toHaveLength(1);
    });

    // An empty stack under "Receive on" reads as a broken screen, and the
    // address does work on the chain the user is on.
    it('falls back to the active chain when the store holds nothing usable', () => {
        expect(visibleChains([], FIRST)).toEqual([FIRST]);
        expect(visibleChains([{ id: 999_999 }], FIRST)).toEqual([FIRST]);
    });

    it('returns nothing when even the active chain is unsupported', () => {
        expect(visibleChains([], 999_999)).toEqual([]);
    });
});
