import { MAINNET_CHAINS, SUPPORTED_CHAINS } from '../account/smartAccount.js';
import type { Chain } from '../store/types.js';

/**
 * The chains the receive screen shows the address as working on.
 *
 * Sourced from the store, which holds what the SDK was initialised with:
 * `createInitialChains` fills it with every chain we support, narrowed only by
 * the `showTestnets` preference. Core is never told the dapp's own chain list
 * (only wagmi knows that), so this is "everywhere this address works", never a
 * claim about what the app accepts.
 *
 * Mainnets only. A testnet in the stack means nothing to someone about to send
 * real funds, and with `showTestnets` on the store carries 22 chains, which
 * turns the stack into a count rather than information.
 *
 * The active chain is always included, even when it is a testnet: the QR points
 * there, so a stack without it would contradict the code beside it.
 *
 * Not a dapp param either way — the destination and the chains it works on are
 * facts about the account, not something a request should be able to assert.
 */
export function visibleChains(configured: readonly Chain[], activeChainId: number): number[] {
    const mainnets = new Set(MAINNET_CHAINS.map((c) => c.id));

    // Deduped: a store holding the same chain twice would otherwise render two
    // identical icons in the stack.
    const held = [...new Set(configured.map((c) => c.id))];
    const visible = held.filter((id) => mainnets.has(id));

    // Whatever the QR encodes belongs in the stack. Testnets are excluded from
    // the list but not from this, or a testnet session shows a stack of chains
    // the code does not point at.
    const activeIsSupported = SUPPORTED_CHAINS.some((c) => c.id === activeChainId);
    if (activeIsSupported && !visible.includes(activeChainId)) {
        return [activeChainId, ...visible];
    }

    if (visible.length > 0) return visible;
    return activeIsSupported ? [activeChainId] : [];
}
