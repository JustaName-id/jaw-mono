const HEX_ADDRESS_RE = /^0x[a-fA-F0-9]{40}$/;

export function isLikelyEnsName(value: string): boolean {
  if (!value) return false;
  return !HEX_ADDRESS_RE.test(value);
}

interface ResolveAddressEntry {
  id: number;
  name: string;
  value: string;
}

interface ResolveEntry {
  ens: string;
  records: {
    addresses?: ResolveAddressEntry[];
  };
}

interface ResolveResponse {
  statusCode: number;
  result: {
    data: ResolveEntry | ResolveEntry[] | null;
    error: string | null;
  };
}

const ENSIP11_OFFSET = 2147483648;
const SLIP44_ETH_COIN_TYPE = 60;

function targetCoinId(chainId: number): number {
  return chainId === 1 ? SLIP44_ETH_COIN_TYPE : ENSIP11_OFFSET + chainId;
}

function pickAddressForChain(entry: ResolveEntry, chainId: number, ensName: string): string {
  const target = targetCoinId(chainId);
  const match = entry.records.addresses?.find((a) => a.id === target);
  if (!match) {
    throw new Error(`No address found for chain ${chainId} on ENS name ${ensName}`);
  }
  return match.value;
}

async function callResolveEndpoint(query: string, ensNamesForError: string): Promise<ResolveResponse> {
  let response: Response;
  try {
    response = await fetch(`https://api.justaname.id/ens/v2/resolve?${query}`);
  } catch (err) {
    const reason = err instanceof Error ? err.message : 'network error';
    throw new Error(`Failed to resolve ${ensNamesForError}: ${reason}`);
  }

  if (!response.ok) {
    throw new Error(`Failed to resolve ${ensNamesForError}: HTTP ${response.status}`);
  }

  const body = (await response.json()) as ResolveResponse;
  if (body.result?.error) {
    throw new Error(`Failed to resolve ${ensNamesForError}: ${body.result.error}`);
  }
  return body;
}

export async function resolveEnsToAddress(ensName: string, chainId: number, rpcUrl: string): Promise<string> {
  if (!rpcUrl) {
    throw new Error('NEXT_PUBLIC_RPC_URL is not configured — cannot resolve ENS names.');
  }

  const query = `ens=${encodeURIComponent(ensName)}&rpcUrl=${encodeURIComponent(rpcUrl)}`;
  const body = await callResolveEndpoint(query, ensName);

  const data = body.result?.data;
  const entry = Array.isArray(data) ? data[0] : data;
  if (!entry) {
    throw new Error(`No address found for chain ${chainId} on ENS name ${ensName}`);
  }
  return pickAddressForChain(entry, chainId, ensName);
}

export async function resolveEnsToAddresses(ensNames: string[], chainId: number, rpcUrl: string): Promise<string[]> {
  if (ensNames.length === 0) return [];
  if (ensNames.length === 1) {
    const single = await resolveEnsToAddress(ensNames[0], chainId, rpcUrl);
    return [single];
  }

  if (!rpcUrl) {
    throw new Error('NEXT_PUBLIC_RPC_URL is not configured — cannot resolve ENS names.');
  }

  const ensQuery = ensNames.map((n) => `ens=${encodeURIComponent(n)}`).join('&');
  const query = `${ensQuery}&rpcUrl=${encodeURIComponent(rpcUrl)}`;
  const body = await callResolveEndpoint(query, ensNames.join(', '));

  const data = body.result?.data;
  const entries = Array.isArray(data) ? data : data ? [data] : [];
  if (entries.length !== ensNames.length) {
    throw new Error(
      `Failed to resolve ${ensNames.join(', ')}: expected ${ensNames.length} entries, got ${entries.length}`
    );
  }

  return entries.map((entry, i) => pickAddressForChain(entry, chainId, ensNames[i]));
}

interface ReverseResponse {
  statusCode: number;
  result: {
    data: {
      address: string;
      name: string | null;
      coinType: number;
    } | null;
    error: string | null;
  };
}

export async function reverseResolveEnsName(address: string, chainId: number, rpcUrl: string): Promise<string | null> {
  if (!rpcUrl) return null;

  const coinType = targetCoinId(chainId);
  const url = `https://api.justaname.id/ens/v2/reverse?rpcUrl=${encodeURIComponent(
    rpcUrl
  )}&address=${encodeURIComponent(address)}&coinType=${coinType}`;

  let response: Response;
  try {
    response = await fetch(url);
  } catch {
    return null;
  }

  if (!response.ok) return null;

  const body = (await response.json()) as ReverseResponse;
  if (body.result?.error) return null;
  return body.result?.data?.name ?? null;
}
