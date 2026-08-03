// Client for the Coinbase x402 Bazaar discovery service — the public catalog of
// x402-payable endpoints. Read-only: this finds services an agent could pay,
// it never pays. Paying a discovered `url` goes back through payAndFetch so the
// on-chain caps and policy still apply.
//
// The Bazaar API is unauthenticated for reads. Everything it returns
// (serviceName, description, tags) is third-party seller copy and therefore
// UNTRUSTED — the MCP layer fences it before handing it to the agent.

import { usdcForNetwork } from './asset-registry.js';

const BAZAAR_BASE = 'https://api.cdp.coinbase.com/platform/v2/x402/discovery';
// Coinbase's own docs cap search at 20 results per call.
const MAX_LIMIT = 20;
const DEFAULT_LIMIT = 10;
const DEFAULT_NETWORK = 'eip155:8453';
// USDC is 6-decimals on every deployment in our registry.
const USDC_DECIMALS = 6;
// The discovery API is a well-behaved HTTPS service, but Node's fetch has no
// default timeout, so bound it like every other network call in this package.
const DISCOVER_TIMEOUT_MS = 15_000;

export interface DiscoverParams {
  /** Free-text/keyword search over the catalog. Required unless `payTo` is set. */
  query?: string;
  /** CAIP-2 network to prefer when picking the price to show. */
  network?: string;
  /** Only surface services at or below this USD price per call. */
  maxUsdPrice?: string;
  /** Only Coinbase-curated (health-probed) services. */
  curatedOnly?: boolean;
  /** Max results, 1..20. */
  limit?: number;
  /** Merchant mode: list every service registered by this seller address. */
  payTo?: string;
}

/** The cheapest payment option for a service, resolved for the caller. */
export interface ServicePrice {
  amount: string;
  asset: string;
  network: string;
  payTo: string | null;
  scheme: string | null;
  maxTimeoutSeconds: number | null;
  /** amount / 10^decimals when the asset is known USDC, else null. */
  approxUsd: number | null;
}

/** One catalog entry, mapped to what an agent needs to decide and then pay. */
export interface DiscoveredService {
  /** Seller-declared name. Null when the service was indexed without one. */
  name: string | null;
  /** The resource URL to pass to jaw_pay_and_fetch. */
  url: string;
  description: string | null;
  tags: string[] | null;
  /** Cheapest option matching the preferred network, else cheapest overall. */
  price: ServicePrice | null;
  /** How to call the resource, as advertised (method + params example). */
  howToCall: unknown;
  /** Index signals — Coinbase-computed, unauditable, informational only. */
  trust: {
    curated: boolean | null;
    calls30d: number | null;
    payers30d: number | null;
    lastCalledAt: string | null;
  };
  x402Version: number | null;
}

export interface DiscoverResult {
  mode: 'search' | 'merchant';
  count: number;
  /** Bazaar signalled the result set was truncated — narrow the query. */
  partialResults: boolean;
  /** How the Bazaar matched (hybrid/vector/text); absent in merchant mode. */
  searchMethod?: string;
  services: DiscoveredService[];
}

// Defensive readers: the response is untrusted remote JSON, so narrow every
// field by runtime type instead of trusting a shape.
function asString(v: unknown): string | null {
  return typeof v === 'string' ? v : null;
}
function asNumber(v: unknown): number | null {
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
}
function asBool(v: unknown): boolean | null {
  return typeof v === 'boolean' ? v : null;
}
function asArray(v: unknown): unknown[] {
  return Array.isArray(v) ? v : [];
}
function asRecord(v: unknown): Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
}

function toPrice(entry: Record<string, unknown>): ServicePrice | null {
  const amount = asString(entry.amount);
  const network = asString(entry.network);
  const asset = asString(entry.asset);
  if (amount === null || !/^\d+$/.test(amount) || network === null || asset === null) return null;

  const usdc = usdcForNetwork(network);
  const approxUsd =
    usdc && usdc.address.toLowerCase() === asset.toLowerCase() ? Number(BigInt(amount)) / 10 ** USDC_DECIMALS : null;

  return {
    amount,
    asset,
    network,
    payTo: asString(entry.payTo),
    scheme: asString(entry.scheme),
    maxTimeoutSeconds: asNumber(entry.maxTimeoutSeconds),
    approxUsd,
  };
}

// Pick the cheapest option, preferring the caller's network. A multi-option
// service can't steer the agent onto a pricier chain, mirroring how the pay
// loop selects the cheapest acceptable requirement.
function selectPrice(accepts: unknown[], preferNetwork: string): ServicePrice | null {
  const prices = accepts.map((a) => toPrice(asRecord(a))).filter((p): p is ServicePrice => p !== null);
  if (prices.length === 0) return null;
  const matching = prices.filter((p) => p.network === preferNetwork);
  const pool = matching.length > 0 ? matching : prices;
  return pool.reduce((min, p) => (BigInt(p.amount) < BigInt(min.amount) ? p : min));
}

function mapService(raw: unknown, preferNetwork: string): DiscoveredService {
  const r = asRecord(raw);
  const info = asRecord(asRecord(asRecord(r.extensions).bazaar).info);
  const quality = asRecord(r.quality);
  const tags = asArray(r.tags).filter((t): t is string => typeof t === 'string');

  return {
    name: asString(r.serviceName),
    url: asString(r.resource) ?? '',
    description: asString(r.description),
    tags: tags.length > 0 ? tags : null,
    price: selectPrice(asArray(r.accepts), preferNetwork),
    howToCall: info.input,
    trust: {
      curated: asBool(r.curated),
      calls30d: asNumber(quality.l30DaysTotalCalls),
      payers30d: asNumber(quality.l30DaysUniquePayers),
      lastCalledAt: asString(quality.lastCalledAt),
    },
    x402Version: asNumber(r.x402Version),
  };
}

async function bazaarGet(path: string, search: URLSearchParams): Promise<Record<string, unknown>> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), DISCOVER_TIMEOUT_MS);
  try {
    const res = await fetch(`${BAZAAR_BASE}/${path}?${search.toString()}`, {
      headers: { Accept: 'application/json' },
      signal: controller.signal,
    });
    if (!res.ok) {
      throw new Error(`x402 Bazaar discovery returned HTTP ${res.status}`);
    }
    return asRecord(await res.json());
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Search the x402 Bazaar (or, with `payTo`, list one seller's services).
 * Returns a compact, mapped view; the raw seller-authored strings inside it are
 * untrusted and must be fenced before reaching the model.
 */
export async function discoverServices(params: DiscoverParams): Promise<DiscoverResult> {
  const network = params.network ?? DEFAULT_NETWORK;

  if (params.payTo) {
    const data = await bazaarGet('merchant', new URLSearchParams({ payTo: params.payTo }));
    const services = asArray(data.resources).map((r) => mapService(r, network));
    return { mode: 'merchant', count: services.length, partialResults: false, services };
  }

  const search = new URLSearchParams();
  if (params.query) search.set('query', params.query);
  search.set('network', network);
  if (params.maxUsdPrice) search.set('maxUsdPrice', params.maxUsdPrice);
  if (params.curatedOnly) search.set('curatedOnly', 'true');
  const limit = Math.min(Math.max(params.limit ?? DEFAULT_LIMIT, 1), MAX_LIMIT);
  search.set('limit', String(limit));

  const data = await bazaarGet('search', search);
  const services = asArray(data.resources).map((r) => mapService(r, network));
  return {
    mode: 'search',
    count: services.length,
    partialResults: asBool(data.partialResults) ?? false,
    searchMethod: asString(data.searchMethod) ?? undefined,
    services,
  };
}
