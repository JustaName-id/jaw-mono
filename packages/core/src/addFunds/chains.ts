import { SUPPORTED_CHAINS } from '../account/smartAccount.js';
import type { Chain } from '../store/types.js';

/**
 * The chains the receive screen shows the address as working on.
 *
 * Taken from the store, which holds what the SDK was initialised with:
 * `createInitialChains` fills it with every chain we support, narrowed only by
 * the `showTestnets` preference. So this is "everywhere this address works",
 * not "the chains this dapp uses" — core is never told the dapp's own chain
 * list, only wagmi knows that. Worth being exact about, because the stack is
 * the screen's claim to the user and it must not overstate what the app accepts.
 *
 * Not a dapp param either way: the destination and the chains it works on are
 * facts about the account, not something a request should be able to assert.
 *
 * An empty or entirely unsupported store falls back to the active chain, since
 * the address does work there and an empty stack under "Receive on" would read
 * as a broken screen.
 */
export function visibleChains(configured: readonly Chain[], activeChainId: number): number[] {
    const supported = new Set(SUPPORTED_CHAINS.map((c) => c.id));

    // Deduped: a store holding the same chain twice would otherwise render two
    // identical icons in the stack.
    const visible = [...new Set(configured.map((c) => c.id))].filter((id) => supported.has(id));

    if (visible.length > 0) return visible;
    return supported.has(activeChainId) ? [activeChainId] : [];
}
