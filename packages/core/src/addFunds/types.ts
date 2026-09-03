/**
 * A way for the user to put funds into their account, as rendered by the Add
 * Funds screen.
 *
 * Phase 1 has exactly one: the receive block (chains, QR, address). It is a
 * descriptor rather than a hard-coded section so the customer funding buttons
 * in phase 2 become further entries in one list, instead of a second code path
 * running alongside the receive block.
 */
export interface FundingSource {
    /** Stable id, used as the React key and in the selection relay in phase 2. */
    id: string;
    /** 'external' joins this in phase 2, for a source that opens off-app. */
    kind: 'receive';
}

/** The receive block, the only funding source phase 1 ships. */
export const RECEIVE_SOURCE: FundingSource = { id: 'receive', kind: 'receive' };
