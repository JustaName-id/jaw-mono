// Selector → signature for the permission screens' allowed-call list: a permission stores only
// 4-byte selectors, so without a lookup the list reads as a column of hex. Signatures come from
// OpenChain via whatsabi — the same loader the transaction screen uses (`useDecodedCalldata`) —
// never from a table of our own, which would only drift.

import { toFunctionSelector } from 'viem';
import { ANY_FN_SEL, EMPTY_CALLDATA_FN_SEL } from '@jaw.id/core';

/** Manager sentinels: not selectors at all, so no registry can answer for them. */
const SENTINEL_LABELS: Record<string, string> = {
  [ANY_FN_SEL.toLowerCase()]: 'Any Function',
  [EMPTY_CALLDATA_FN_SEL.toLowerCase()]: 'Empty Calldata',
};

/** A sentinel's label, or null. Synchronous — safe to call during render. */
export function sentinelSignature(selector?: string): string | null {
  if (!selector) return null;
  return SENTINEL_LABELS[selector.toLowerCase()] ?? null;
}

/**
 * Pick the one signature a selector unambiguously means, or null.
 *
 * The registry is open, so a lookup returns *claims*, not an answer:
 *  - **Verify** — keep only candidates that hash to the selector. `0xdeadbeef` returns
 *    `CodeIsLawZ95677371()`.
 *  - **Refuse when ambiguous** — collisions are farmed. `0xa22cb465` returns both
 *    `setApprovalForAll(address,bool)` and `niceFunctionHerePlzClick943230089(address,bool)`, and
 *    *both verify*. Registry order is not a trust signal, so with more than one preimage we say
 *    nothing and the row keeps its hex.
 */
export function selectVerifiedSignature(selector: string, candidates: string[]): string | null {
  const target = selector.toLowerCase();
  const verified = candidates.filter((sig) => {
    try {
      return toFunctionSelector(sig).toLowerCase() === target;
    } catch {
      return false;
    }
  });
  return verified.length === 1 ? verified[0] : null;
}

/** A sentinel's label, else OpenChain's verified signature. Null on anything unresolved. */
export async function resolveFunctionSignature(selector: string): Promise<string | null> {
  const key = selector.toLowerCase();
  const sentinel = sentinelSignature(key);
  if (sentinel) return sentinel;
  // Not a 4-byte selector: no point asking, and no point disclosing it.
  if (!/^0x[0-9a-f]{8}$/.test(key)) return null;

  try {
    // Dynamic import for the same reason as the calldata decoder: nothing needs whatsabi for the
    // first paint, and the allowed-call list starts collapsed.
    const { whatsabi } = await import('@shazow/whatsabi');
    const found = await new whatsabi.loaders.OpenChainSignatureLookup().loadFunctions(key);
    return selectVerifiedSignature(key, found ?? []);
  } catch {
    // Offline or rate-limited — the row keeps showing the raw hex.
    return null;
  }
}
