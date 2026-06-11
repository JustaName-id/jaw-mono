const REVERSE_ENDPOINT = 'https://api.justaname.id/ens/v2/reverse';
const MAX_BATCH = 50;
const IPFS_GATEWAY = 'https://ipfs.io/ipfs/';

export interface ReverseInput {
  address: string;
  chainId: number;
}

export interface ResolvedIdentity {
  name: string;
  avatar?: string;
}

interface ReverseText {
  key: string;
  value: string;
}

interface ReverseSlot {
  address: string;
  name: string | null;
  // With `records=true`, records are attached in /v2/resolve's shape — note the nested `records.records`.
  records?: { records?: { texts?: ReverseText[] | null } | null } | null;
}

interface ReverseResponse {
  result?: { data?: ReverseSlot | ReverseSlot[] | null };
}

/** Normalize a raw ENS `avatar` record to a renderable image URL, or null for schemes we can't put in an <img> (e.g. `eip155:` NFT refs). */
function normalizeAvatarUrl(value: string | undefined): string | null {
  if (!value) return null;
  if (value.startsWith('https://') || value.startsWith('http://')) return value;
  if (value.startsWith('data:image/')) return value;
  if (value.startsWith('ipfs://')) {
    return IPFS_GATEWAY + value.slice('ipfs://'.length).replace(/^ipfs\//, '');
  }
  return null;
}

async function fetchReverseBatch(
  batch: ReverseInput[],
  rpcUrl: string,
  withRecords: boolean
): Promise<Record<string, ResolvedIdentity>> {
  const url = new URL(REVERSE_ENDPOINT);
  // Per-address `@eip155:<chainId>` suffix scopes each address to its chain; the API echoes it back lowercased and stripped.
  batch.forEach(({ address, chainId }) => url.searchParams.append('address', `${address}@eip155:${chainId}`));
  url.searchParams.set('rpcUrl', rpcUrl);
  // records=true returns each name's records inline, so the avatar needs no separate forward resolution.
  if (withRecords) url.searchParams.set('records', 'true');

  const res = await fetch(url.toString());
  if (!res.ok) return {};

  const body = (await res.json()) as ReverseResponse;
  const data = body.result?.data;
  if (!data) return {};

  const slots = Array.isArray(data) ? data : [data];
  const resolved: Record<string, ResolvedIdentity> = {};
  for (const slot of slots) {
    if (!slot?.name) continue;
    const identity: ResolvedIdentity = { name: slot.name };
    if (withRecords) {
      const avatar = normalizeAvatarUrl(slot.records?.records?.texts?.find((t) => t.key === 'avatar')?.value);
      if (avatar) identity.avatar = avatar;
    }
    resolved[slot.address.toLowerCase()] = identity;
  }
  return resolved;
}

async function reverseResolve(
  inputs: ReverseInput[],
  rpcUrl: string,
  withRecords: boolean
): Promise<Record<string, ResolvedIdentity>> {
  const unique = Array.from(new Map(inputs.map((i) => [`${i.address.toLowerCase()}:${i.chainId}`, i])).values());
  if (unique.length === 0) return {};

  const batches: ReverseInput[][] = [];
  for (let i = 0; i < unique.length; i += MAX_BATCH) {
    batches.push(unique.slice(i, i + MAX_BATCH));
  }

  const results = await Promise.all(
    batches.map((batch) => fetchReverseBatch(batch, rpcUrl, withRecords).catch(() => ({})))
  );
  return Object.assign({}, ...results);
}

/** Reverse-resolve addresses to ENS names in one batched request (deduped, chunked at 50, parallel). Never rejects; unresolved addresses are omitted. Returns lowercased address -> name. */
export async function reverseResolveAddresses(inputs: ReverseInput[], rpcUrl: string): Promise<Record<string, string>> {
  const identities = await reverseResolve(inputs, rpcUrl, false);
  const names: Record<string, string> = {};
  for (const [address, identity] of Object.entries(identities)) {
    names[address] = identity.name;
  }
  return names;
}

/** Like {@link reverseResolveAddresses} but with `records=true`, so each name's avatar comes back in the same request. Returns lowercased address -> { name, avatar? }. */
export async function reverseResolveWithAvatars(
  inputs: ReverseInput[],
  rpcUrl: string
): Promise<Record<string, ResolvedIdentity>> {
  return reverseResolve(inputs, rpcUrl, true);
}
