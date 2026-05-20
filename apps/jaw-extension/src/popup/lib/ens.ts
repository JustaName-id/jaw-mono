/**
 * ENS resolution for the popup's account card.
 *
 * JAW subnames (`xxx.jaw.id`) live on mainnet ENS, so we always resolve
 * against mainnet regardless of the user's currently-active chain. Uses
 * viem's default mainnet transport (Cloudflare's free public RPC) so this
 * works without requiring our JAW API key or routing through the offscreen.
 *
 * In-memory cache keyed by lowercase address. Survives popup lifetime only;
 * re-resolves on a fresh popup open. ENS reverse lookups change rarely so
 * the small redundancy is fine.
 */

import { createPublicClient, http, type Address } from 'viem';
import { mainnet } from 'viem/chains';

// Pinned to an explicit RPC. Bare `http()` falls back to viem's default
// (currently cloudflare-eth.com) which can change between viem versions —
// we'd rather know exactly which third party we depend on. llamarpc has
// historically been more permissive on rate limits than cloudflare.
const ENS_RPC_URL = 'https://eth.llamarpc.com';

const ensClient = createPublicClient({
  chain: mainnet,
  transport: http(ENS_RPC_URL),
});

interface CacheEntry {
  name: string | null;
  // For negative results (`null`), entries expire so a transient RPC outage
  // doesn't permanently suppress the real ENS name. Positive results don't
  // expire — ENS reverse records change rarely and re-resolution costs an
  // RPC roundtrip.
  expiresAt: number;
}

const NEGATIVE_TTL_MS = 5 * 60 * 1000;
// Even positive ENS results get a TTL — names can be transferred. 1 hour is
// long enough to avoid spamming the public RPC, short enough that a stale
// name corrects itself the next popup open after a transfer.
const POSITIVE_TTL_MS = 60 * 60 * 1000;

const cache: Map<string, CacheEntry> = new Map();

export async function resolveEnsName(address: string | undefined): Promise<string | null> {
  if (!address) return null;
  const key = address.toLowerCase();
  const cached = cache.get(key);
  if (cached && cached.expiresAt > Date.now()) return cached.name;
  try {
    const name = await ensClient.getEnsName({ address: address as Address });
    cache.set(key, {
      name: name ?? null,
      expiresAt: Date.now() + (name ? POSITIVE_TTL_MS : NEGATIVE_TTL_MS),
    });
    return name ?? null;
  } catch {
    // RPC unreachable / rate-limited — fall back to hex, retry later.
    cache.set(key, { name: null, expiresAt: Date.now() + NEGATIVE_TTL_MS });
    return null;
  }
}
