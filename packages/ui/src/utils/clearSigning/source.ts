// ============================================================================
//  Descriptor source
// ----------------------------------------------------------------------------
// v1 implementation: fetch from GitHub raw + in-process cache.
// Swap in a backend proxy later by implementing DescriptorSource and replacing
// `getDefaultDescriptorSource()` — single point of override.
//
// Also hosts the ERC-7730 `includes` resolution/merge helpers and the shared
// `caip10` / `eqHex` primitives. Kept free of the @jaw.id/core dependency so the
// resolvers (eip712.ts, calldata.ts) and these helpers stay unit-testable in
// isolation.
// ============================================================================

import type { CalldataIndex, Descriptor, Eip712Index } from './types';

const REGISTRY_REPO = 'ethereum/clear-signing-erc7730-registry';
const REGISTRY_BRANCH = 'master';
const REGISTRY_BASE = `https://raw.githubusercontent.com/${REGISTRY_REPO}/${REGISTRY_BRANCH}`;

export interface DescriptorSource {
  getCalldataIndex(): Promise<CalldataIndex>;
  getEip712Index(): Promise<Eip712Index>;
  getDescriptor(path: string): Promise<Descriptor>;
}

async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Clear-signing fetch failed: ${res.status} ${url}`);
  return (await res.json()) as T;
}

// No application-level cache or inflight dedup — every call hits GitHub raw fresh.
// (The browser still honours GitHub's HTTP Cache-Control: max-age=300 on the response
// itself; that's outside our control. If even that's undesirable, callers can add
// `cache: 'no-store'` to the fetch.)
class GithubDescriptorSource implements DescriptorSource {
  getCalldataIndex() {
    return fetchJson<CalldataIndex>(`${REGISTRY_BASE}/index.calldata.json`);
  }
  getEip712Index() {
    return fetchJson<Eip712Index>(`${REGISTRY_BASE}/index.eip712.json`);
  }
  getDescriptor(path: string) {
    return fetchJson<Descriptor>(`${REGISTRY_BASE}/${path}`);
  }
}

let defaultSource: DescriptorSource | null = null;
export function getDefaultDescriptorSource(): DescriptorSource {
  if (!defaultSource) defaultSource = new GithubDescriptorSource();
  return defaultSource;
}

/** Build a CAIP-10 identifier (`eip155:<chainId>:<address.lowercased>`) used by the ERC-7730 indexes. */
export const caip10 = (chainId: number, address: string) => `eip155:${chainId}:${address.toLowerCase()}`;

/** Lowercase comparator for hex strings (addresses, bytes32 salt). */
export function eqHex(a: unknown, b: unknown): boolean {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  return a.toLowerCase() === b.toLowerCase();
}

// ============================================================================
// ERC-7730 `includes` resolution
// ----------------------------------------------------------------------------
// A registry descriptor may `include` a shared base descriptor (e.g. every
// token's Permit binding includes `ercs/eip712-erc2612-permit.json` for the
// shared display formats). This resolves + merges that chain.
// ============================================================================

/** Resolve an ERC-7730 `includes` path (e.g. `../../ercs/foo.json`) relative to the including file. */
export function resolveRelativePath(basePath: string, rel: string): string {
  const segs = basePath.split('/').slice(0, -1); // dirname
  for (const s of rel.split('/')) {
    if (s === '..') segs.pop();
    else if (s === '.' || s === '') continue;
    else segs.push(s);
  }
  return segs.join('/');
}

/** Deep-merge a base (included) descriptor with a local one; local values win. */
export function mergeDescriptor(base: Descriptor, local: Descriptor): Descriptor {
  return {
    ...base,
    ...local,
    context: {
      ...base.context,
      ...local.context,
      eip712: { ...base.context?.eip712, ...local.context?.eip712 },
      contract: { ...base.context?.contract, ...local.context?.contract },
    },
    metadata: { ...base.metadata, ...local.metadata },
    display: {
      ...base.display,
      ...local.display,
      formats: { ...base.display?.formats, ...local.display?.formats },
      definitions: { ...base.display?.definitions, ...local.display?.definitions },
    },
  };
}

/**
 * Fetch a descriptor and fully resolve its `includes` chain (base merged first,
 * local overrides). Without this, include-based registry entries (all token Permits,
 * many calldata descriptors) carry no `display.formats` and never clear-sign.
 */
export async function loadDescriptor(source: DescriptorSource, path: string): Promise<Descriptor> {
  let descriptor = await source.getDescriptor(path);
  let currentPath = path;
  let hops = 0;
  while (descriptor.includes && hops < 5) {
    const incPath = resolveRelativePath(currentPath, descriptor.includes);
    let base: Descriptor;
    try {
      base = await source.getDescriptor(incPath);
    } catch {
      break; // include unavailable — proceed with what we have
    }
    const merged = mergeDescriptor(base, descriptor);
    // Continue up the chain via the base's own `includes` (not the local pointer we just consumed).
    merged.includes = base.includes;
    descriptor = merged;
    currentPath = incPath;
    hops++;
  }
  delete descriptor.includes;
  return descriptor;
}
