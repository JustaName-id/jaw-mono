import { useState, useEffect } from 'react';

import { reverseResolveWithAvatars } from '../utils/reverseResolve';
import { getChainLabel } from '../utils/resolveChainLabel';

export interface ReverseIdentity {
  /** Reverse-resolved primary ENS name (suffixed `@chainlabel` off-mainnet), or null. */
  name: string | null;
  /** ENS avatar URL, or null. */
  avatar: string | null;
}

/**
 * Reverse-resolves an address to its primary ENS name + avatar. Returns nulls
 * until (or unless) resolution succeeds, so callers render the address first and
 * upgrade in place — e.g. `name ?? formatAddress(address)`. Shared by every
 * dialog that shows an account (Connect, Signature, …) so the resolution/cancel
 * logic lives in one place.
 */
export function useReverseIdentity(
  address: string | undefined,
  chainId: number | undefined,
  mainnetRpcUrl: string
): ReverseIdentity {
  const [name, setName] = useState<string | null>(null);
  const [avatar, setAvatar] = useState<string | null>(null);

  useEffect(() => {
    setName(null);
    setAvatar(null);
    if (!address || !chainId) return;
    let cancelled = false;
    reverseResolveWithAvatars([{ address, chainId }], mainnetRpcUrl)
      .then(async (resolved) => {
        if (cancelled) return;
        const identity = resolved[address.toLowerCase()];
        if (identity) {
          const label = await getChainLabel(chainId, mainnetRpcUrl);
          if (cancelled) return;
          setName(label ? `${identity.name}@${label}` : identity.name);
          setAvatar(identity.avatar ?? null);
        }
      })
      .catch(() => {
        // Silently fall back to the address + blob
      });
    return () => {
      cancelled = true;
    };
  }, [address, chainId, mainnetRpcUrl]);

  return { name, avatar };
}
