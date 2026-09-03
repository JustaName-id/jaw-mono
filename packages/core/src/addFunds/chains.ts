import { SUPPORTED_CHAINS } from '../account/smartAccount.js';
import type { Chain } from '../store/types.js';

/**
 * The chains the receive screen shows the address as working on.
 *
 * The app's own configured chains, intersected with what we support. Two things
 * this is deliberately not:
 *
 * - Not a dapp param. The SDK already holds these from init, so asking for them
 *   again would let one request disagree with the app's own configuration.
 * - Not `SUPPORTED_CHAINS` as a fallback. Falling back to everything we support
 *   would put testnets in a mainnet-only app's stack, telling the user their
 *   address works somewhere the app never intended.
 *
 * An app that configured nothing we support gets the active chain alone, since
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
