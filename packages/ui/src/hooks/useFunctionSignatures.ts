'use client';

import { useEffect, useState } from 'react';
import { resolveFunctionSignature, sentinelSignature } from '../utils/functionSignature';

/**
 * Signatures for a set of selectors, keyed by lowercased selector.
 *
 * Manager sentinels are present on the first render; the rest fill in as OpenChain answers,
 * so the allowed-call list shows raw hex for a moment and upgrades in place rather than holding the
 * dialog back. Misses simply never appear in the map, and the caller falls back to the selector.
 */
export function useFunctionSignatures(selectors: (string | undefined)[]): Record<string, string> {
  const [resolved, setResolved] = useState<Record<string, string>>({});

  // Content key: a new array of the same selectors must not refetch.
  const key = [...new Set(selectors.filter((s): s is string => !!s).map((s) => s.toLowerCase()))].sort().join(',');

  useEffect(() => {
    const list = key ? key.split(',') : [];
    const unknown = list.filter((s) => !sentinelSignature(s));
    if (unknown.length === 0) return;

    let cancelled = false;
    Promise.all(unknown.map(async (selector) => [selector, await resolveFunctionSignature(selector)] as const)).then(
      (entries) => {
        if (cancelled) return;
        const next: Record<string, string> = {};
        for (const [selector, signature] of entries) if (signature) next[selector] = signature;
        if (Object.keys(next).length > 0) setResolved((prev) => ({ ...prev, ...next }));
      }
    );

    return () => {
      cancelled = true;
    };
  }, [key]);

  const out: Record<string, string> = {};
  for (const selector of key ? key.split(',') : []) {
    const signature = sentinelSignature(selector) ?? resolved[selector];
    if (signature) out[selector] = signature;
  }
  return out;
}
