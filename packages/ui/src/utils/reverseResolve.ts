const REVERSE_ENDPOINT = 'https://api.justaname.id/ens/v2/reverse';
const MAX_BATCH = 50; // endpoint accepts up to 50 addresses per request

export interface ReverseInput {
  address: string;
  chainId: number;
}

interface ReverseSlot {
  address: string;
  name: string | null;
  error?: string | null;
}

interface ReverseResponse {
  result?: {
    data?: ReverseSlot | ReverseSlot[] | null;
    error?: string | null;
  };
}

async function fetchReverseBatch(batch: ReverseInput[], rpcUrl: string): Promise<Record<string, string>> {
  const url = new URL(REVERSE_ENDPOINT);
  // Per-address `@eip155:<chainId>` suffix lets one request span chains; the API
  // echoes each address back stripped of the suffix and lowercased.
  batch.forEach(({ address, chainId }) => url.searchParams.append('address', `${address}@eip155:${chainId}`));
  url.searchParams.set('rpcUrl', rpcUrl);

  const res = await fetch(url.toString());
  if (!res.ok) return {};

  const body = (await res.json()) as ReverseResponse;
  const data = body.result?.data;
  if (!data) return {};

  const slots = Array.isArray(data) ? data : [data];
  const resolved: Record<string, string> = {};
  for (const slot of slots) {
    if (slot?.name) resolved[slot.address.toLowerCase()] = slot.name;
  }
  return resolved;
}

/**
 * Reverse-resolve a batch of addresses to ENS names via the JustaName REST API
 * (GET /ens/v2/reverse), collapsing what used to be one SDK call per address
 * into a single request (chunked at the endpoint's 50-address limit, chunks run
 * in parallel). Returns a map of lowercased address -> name for the slots that
 * resolved to a name. Never rejects: any failure (per chunk) omits those
 * addresses so callers fall back to the raw address.
 */
export async function reverseResolveAddresses(inputs: ReverseInput[], rpcUrl: string): Promise<Record<string, string>> {
  const unique = Array.from(new Map(inputs.map((i) => [`${i.address.toLowerCase()}:${i.chainId}`, i])).values());
  if (unique.length === 0) return {};

  const batches: ReverseInput[][] = [];
  for (let i = 0; i < unique.length; i += MAX_BATCH) {
    batches.push(unique.slice(i, i + MAX_BATCH));
  }

  const results = await Promise.all(batches.map((batch) => fetchReverseBatch(batch, rpcUrl).catch(() => ({}))));
  return Object.assign({}, ...results);
}
