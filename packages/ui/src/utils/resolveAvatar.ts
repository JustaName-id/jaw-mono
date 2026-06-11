const RESOLVE_ENDPOINT = 'https://api.justaname.id/ens/v2/resolve';
const MAX_BATCH = 50; // endpoint accepts up to 50 names per request
const IPFS_GATEWAY = 'https://ipfs.io/ipfs/';

interface ResolveText {
  key: string;
  value: string;
}

interface ResolveSlot {
  ens?: string;
  records?: { texts?: ResolveText[] | null } | null;
}

interface ResolveResponse {
  result?: {
    data?: ResolveSlot | ResolveSlot[] | null;
    error?: string | null;
  };
}

/**
 * Turn a raw ENS `avatar` record into a renderable image URL. Passes through
 * http(s) and `data:image/` URLs, rewrites `ipfs://` to a gateway, and returns
 * null for schemes we can't render to an <img> here (e.g. `eip155:` NFT
 * references, which need on-chain token + metadata resolution).
 */
function normalizeAvatarUrl(value: string | undefined): string | null {
  if (!value) return null;
  if (value.startsWith('https://') || value.startsWith('http://')) return value;
  if (value.startsWith('data:image/')) return value;
  if (value.startsWith('ipfs://')) {
    return IPFS_GATEWAY + value.slice('ipfs://'.length).replace(/^ipfs\//, '');
  }
  return null;
}

async function fetchAvatarBatch(names: string[], rpcUrl: string): Promise<Record<string, string>> {
  const url = new URL(RESOLVE_ENDPOINT);
  names.forEach((ens) => url.searchParams.append('ens', ens));
  url.searchParams.set('rpcUrl', rpcUrl);

  const res = await fetch(url.toString());
  if (!res.ok) return {};

  const body = (await res.json()) as ResolveResponse;
  const data = body.result?.data;
  if (!data) return {};

  const slots = Array.isArray(data) ? data : [data];
  const avatars: Record<string, string> = {};
  for (const slot of slots) {
    if (!slot?.ens) continue;
    const raw = slot.records?.texts?.find((t) => t.key === 'avatar')?.value;
    const normalized = normalizeAvatarUrl(raw);
    if (normalized) avatars[slot.ens] = normalized;
  }
  return avatars;
}

/**
 * Resolve ENS avatar image URLs for a set of names via JustaName forward
 * resolution (GET /ens/v2/resolve), reading each name's `avatar` text record.
 * Chunked at the 50-name limit, chunks run in parallel. Returns a map of
 * name -> image URL, omitting names with no avatar or an unsupported scheme.
 * Never rejects: any failure (per chunk) omits those names.
 */
export async function resolveAvatars(names: string[], rpcUrl: string): Promise<Record<string, string>> {
  const unique = Array.from(new Set(names.filter(Boolean)));
  if (unique.length === 0) return {};

  const batches: string[][] = [];
  for (let i = 0; i < unique.length; i += MAX_BATCH) {
    batches.push(unique.slice(i, i + MAX_BATCH));
  }

  const results = await Promise.all(batches.map((batch) => fetchAvatarBatch(batch, rpcUrl).catch(() => ({}))));
  return Object.assign({}, ...results);
}
