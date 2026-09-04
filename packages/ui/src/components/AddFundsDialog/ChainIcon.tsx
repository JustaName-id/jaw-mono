'use client';

import { useChainIconURI } from '../../hooks';

/**
 * One chain's icon as a component.
 *
 * `useChainIconURI` returns JSX, which every other call site uses for a single
 * chain. The stack renders several, and a hook cannot be called in a loop, so
 * this wrapper gives each icon its own component instance to hold the hook.
 */
export function ChainIcon({ chainId, apiKey, size = 20 }: { chainId: number; apiKey?: string; size?: number }) {
  return useChainIconURI(chainId, apiKey, size);
}
