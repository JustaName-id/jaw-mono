const REVERSE_ENDPOINT = 'https://api.justaname.id/ens/v2/reverse';
const MAX_BATCH = 50;
// ENS metadata service: a valid-cert proxy that resolves a name's avatar record server-side and
// streams the bytes. We render this instead of the raw avatar URL so the signing/permission page
// never connects directly to an attacker-controlled host — a host with a TLS cert error there
// taints the page and blocks the WebAuthn (passkey) ceremony in strict browsers (e.g. Brave).
const ENS_METADATA_AVATAR_BASE = 'https://metadata.ens.domains/mainnet/avatar/';

/** The ENS metadata proxy URL for a name's avatar. */
function ensMetadataAvatarUrl(name: string): string {
  return ENS_METADATA_AVATAR_BASE + encodeURIComponent(name);
}

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
      // Gate on record presence only; the ENS metadata proxy resolves the record's value
      // (https/ipfs/data/eip155 NFT) itself, so we don't parse it here.
      const hasAvatar = !!slot.records?.records?.texts?.find((t) => t.key === 'avatar')?.value;
      if (hasAvatar) identity.avatar = ensMetadataAvatarUrl(slot.name);
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
