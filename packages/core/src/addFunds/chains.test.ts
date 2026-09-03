import { describe, expect, it } from 'vitest';
import { visibleChains } from './chains.js';
import { MAINNET_CHAINS, TESTNET_CHAINS } from '../account/smartAccount.js';

const BASE = MAINNET_CHAINS[0]!.id;
const SECOND_MAINNET = MAINNET_CHAINS[1]!.id;
const A_TESTNET = TESTNET_CHAINS[0]!.id;

describe('visibleChains', () => {
    it('returns the app’s configured chains', () => {
        expect(visibleChains([{ id: BASE }, { id: SECOND_MAINNET }], BASE)).toEqual([BASE, SECOND_MAINNET]);
    });

    it('drops a chain we do not support', () => {
        expect(visibleChains([{ id: BASE }, { id: 999_999 }], BASE)).toEqual([BASE]);
    });

    it('dedupes, so the stack never shows the same icon twice', () => {
        expect(visibleChains([{ id: BASE }, { id: BASE }], BASE)).toEqual([BASE]);
    });

    // The old allowlist fell back to every supported chain, which is how a
    // mainnet-only app ended up offering testnets.
    it('never widens to every supported chain when the app configured one', () => {
        const visible = visibleChains([{ id: BASE }], BASE);
        expect(visible).toEqual([BASE]);
        expect(visible).not.toContain(A_TESTNET);
    });

    it('shows a testnet only when the app configured it', () => {
        expect(visibleChains([{ id: A_TESTNET }], A_TESTNET)).toEqual([A_TESTNET]);
    });

    // An empty stack under "Receive on" reads as a broken screen, and the
    // address does work on the chain the user is on.
    it('falls back to the active chain when nothing configured is supported', () => {
        expect(visibleChains([], BASE)).toEqual([BASE]);
        expect(visibleChains([{ id: 999_999 }], BASE)).toEqual([BASE]);
    });

    it('returns nothing when even the active chain is unsupported', () => {
        expect(visibleChains([], 999_999)).toEqual([]);
    });
});
