// ============================================================================
// ERC-7730 clear-signing engine
// ----------------------------------------------------------------------------
// Self-contained module that:
//   1. Defines descriptor / display types
//   2. Implements path resolution for the ERC-7730 path syntax
//   3. Fetches descriptors from the public registry (ethereum/clear-signing-erc7730-registry)
//   4. Resolves the matching descriptor + format for either calldata or EIP-712
//   5. Applies the descriptor format to decoded args to produce a DisplayRow[]
//   6. Provides a shared per-chain ERC-20 (decimals, symbol) resolver
//
// Consumed by: hooks/useClearSigning{Calldata,TypedData,ContractNames}.ts
// ============================================================================

import {
  createPublicClient,
  decodeFunctionData,
  domainSeparator,
  formatUnits,
  http,
  isAddress,
  keccak256,
  parseAbiItem,
  stringToHex,
  toFunctionSelector,
  type Abi,
  type AbiFunction,
  type Hex,
  type TypedDataDomain,
} from 'viem';
import { JAW_RPC_URL, SUPPORTED_CHAINS } from '@jaw.id/core';

// ============================================================================
//  Types
// ============================================================================

export type FieldFormatKind =
  | 'raw'
  | 'addressName'
  | 'tokenAmount'
  | 'amount'
  | 'date'
  | 'unit'
  | 'nftName'
  | 'duration'
  | 'enum'
  | 'calldata';

export interface FieldFormatParams {
  tokenPath?: string;
  nativeCurrencyAddress?: string | string[];
  threshold?: string;
  message?: string;
  encoding?: 'timestamp' | 'blockheight';
  decimals?: number;
  base?: string;
  prefix?: string | boolean;
  trustedSources?: string[];
  types?: string[];
  sources?: string[];
}

export interface DescriptorField {
  path: string;
  label?: string;
  format?: FieldFormatKind;
  params?: FieldFormatParams;
  $ref?: string;
  visible?: boolean | 'always' | 'never';
  fields?: DescriptorField[];
  mustMatch?: string[];
  ifNotIn?: string[];
}

export interface DescriptorFormat {
  $id?: string;
  intent?: string | Record<string, string>;
  fields?: DescriptorField[];
  required?: string[];
  excluded?: string[];
}

export interface DescriptorDefinitions {
  [name: string]: Partial<DescriptorField>;
}

export interface DescriptorMetadata {
  owner?: string;
  info?: { legalName?: string; url?: string; lastUpdate?: string };
  token?: { name?: string; ticker?: string; decimals?: number };
  enums?: Record<string, Record<string, string>>;
  contractName?: string;
}

export interface DescriptorDeployment {
  chainId: number;
  address: string;
}

export interface Descriptor {
  context: {
    $id?: string;
    contract?: { deployments?: DescriptorDeployment[]; abi?: unknown };
    eip712?: {
      domain?: {
        name?: string;
        chainId?: number;
        verifyingContract?: string;
        version?: string;
        salt?: string;
      };
      domainSeparator?: Hex;
      schemas?: unknown;
      deployments?: DescriptorDeployment[];
    };
  };
  metadata?: DescriptorMetadata;
  display: {
    definitions?: DescriptorDefinitions;
    formats: Record<string, DescriptorFormat>;
  };
}

// Registry index shapes.
export type CalldataIndex = Record<string, string>; // CAIP10 -> relative path

export type Eip712IndexEntry = Record<
  string, // primaryType
  Array<{ path: string; encodeTypeHashes?: string[] }>
>;
export type Eip712Index = Record<string, Eip712IndexEntry>;

// Display row produced by the formatter — what the UI actually renders.
export type DisplayRowKind = 'address' | 'tokenAmount' | 'amount' | 'date' | 'unit' | 'text' | 'raw';

export interface DisplayRow {
  label: string;
  /** Pre-formatted user-facing value. */
  value: string;
  kind: DisplayRowKind;
  /** Raw underlying value (hex address, bigint string, …) — used for copy / ENS resolution. */
  rawValue?: string;
  /** When kind === 'tokenAmount' or 'amount': the symbol shown next to the value. */
  symbol?: string;
  /** When kind === 'tokenAmount': the underlying ERC-20 address (for icon lookup). */
  tokenAddress?: string;
}

export interface ClearSigningDisplay {
  /** Title for the signing screen (e.g. "Swap", "Permit"). */
  intent?: string;
  /** Human-friendly contract name from descriptor metadata, e.g. "Uniswap V3 Router 2". */
  contractName?: string;
  /** Descriptor owner / issuer attribution, e.g. "Aave DAO". */
  owner?: string;
  /** URL provided by the descriptor for additional info on the issuer. */
  ownerUrl?: string;
  rows: DisplayRow[];
}

// ============================================================================
//  Path resolution
// ----------------------------------------------------------------------------
// ERC-7730 path roots:
//   `@.X`  → transaction envelope (from, to, value, chainId, …)
//   `#.X`  → function arguments
//   `X`    → function arguments (implicit, same as `#.X`)
//   `$.X`  → descriptor-internal ($ref) — resolved upstream in mergeField, not here.
//
// Segment syntax:
//   `a.b.c`    → nested object access
//   `[n]`      → array indexing (negative from end)
//   `[]`       → iterate all elements
//   `[a:b]`    → byte slice on a `bytes`/hex value
// ============================================================================

interface PathContext {
  args: Record<string, unknown>;
  tx: Record<string, unknown>;
}

const SLICE_RE = /^\[(-?\d+):(-?\d+)?\]$/;
const INDEX_RE = /^\[(-?\d+)\]$/;
const ITER_RE = /^\[\]$/;

function splitPath(path: string): string[] {
  const out: string[] = [];
  let buf = '';
  for (let i = 0; i < path.length; i++) {
    const ch = path[i];
    if (ch === '.') {
      if (buf) {
        out.push(buf);
        buf = '';
      }
    } else if (ch === '[') {
      if (buf) {
        out.push(buf);
        buf = '';
      }
      const end = path.indexOf(']', i);
      if (end === -1) {
        buf += path.slice(i);
        i = path.length;
      } else {
        out.push(path.slice(i, end + 1));
        i = end;
      }
    } else {
      buf += ch;
    }
  }
  if (buf) out.push(buf);
  return out;
}

function sliceBytes(hex: string, start: number, end?: number): string {
  const stripped = hex.startsWith('0x') ? hex.slice(2) : hex;
  const byteLen = stripped.length / 2;
  const s = start < 0 ? Math.max(0, byteLen + start) : Math.min(start, byteLen);
  const e = end === undefined ? byteLen : end < 0 ? Math.max(0, byteLen + end) : Math.min(end, byteLen);
  return '0x' + stripped.slice(s * 2, e * 2);
}

export function resolvePath(path: string, ctx: PathContext): unknown {
  if (!path) return undefined;

  let clean = path;
  let current: unknown = ctx.args;
  if (path.startsWith('@.')) {
    current = ctx.tx;
    clean = path.slice(2);
  } else if (path.startsWith('#.')) {
    current = ctx.args;
    clean = path.slice(2);
  }

  for (const seg of splitPath(clean)) {
    if (current === undefined || current === null) return undefined;

    if (ITER_RE.test(seg)) {
      return Array.isArray(current) ? current : undefined;
    }

    const idxMatch = seg.match(INDEX_RE);
    if (idxMatch) {
      if (!Array.isArray(current)) return undefined;
      const idx = Number(idxMatch[1]);
      current = current[idx < 0 ? current.length + idx : idx];
      continue;
    }

    const sliceMatch = seg.match(SLICE_RE);
    if (sliceMatch) {
      const start = Number(sliceMatch[1]);
      const end = sliceMatch[2] !== undefined ? Number(sliceMatch[2]) : undefined;
      if (typeof current === 'string' && current.startsWith('0x')) {
        current = sliceBytes(current, start, end);
        continue;
      }
      if (Array.isArray(current)) {
        current = current.slice(start, end);
        continue;
      }
      return undefined;
    }

    if (typeof current === 'object' && current !== null) {
      current = (current as Record<string, unknown>)[seg];
    } else {
      return undefined;
    }
  }

  return current;
}

// ============================================================================
//  Descriptor source
// ----------------------------------------------------------------------------
// v1 implementation: fetch from GitHub raw + in-process cache.
// Swap in a backend proxy later by implementing DescriptorSource and replacing
// `getDefaultDescriptorSource()` — single point of override.
// ============================================================================

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

// ============================================================================
//  Resolver
// ----------------------------------------------------------------------------
// Match a transaction or typed-data signature against the registry, returning
// the descriptor + the specific format spec to apply.
// ============================================================================

/** Build a CAIP-10 identifier (`eip155:<chainId>:<address.lowercased>`) used by the ERC-7730 indexes. */
export const caip10 = (chainId: number, address: string) => `eip155:${chainId}:${address.toLowerCase()}`;

/**
 * Compute the 4-byte selector for a descriptor's `display.formats` key.
 *
 * Uses viem's `parseAbiItem` as the single source of truth for parsing — the same
 * parser the downstream `decodeCalldataWithSignature` will use to build the AbiFunction
 * that feeds `decodeFunctionData`. Sharing one parser guarantees the selector match
 * and the decode step agree on what the descriptor says: no risk of one accepting an
 * input the other rejects (silent clear-signing drop) or, worse, both accepting it
 * but reaching different parameter shapes (silent type confusion).
 */
function selectorForKey(formatKey: string): Hex | null {
  try {
    const abiItem = parseAbiItem(`function ${formatKey}`) as AbiFunction;
    return toFunctionSelector(abiItem);
  } catch {
    return null;
  }
}

export interface CalldataMatch {
  descriptor: Descriptor;
  formatKey: string;
  format: DescriptorFormat;
}

/**
 * Build a selector → formatKey map for a descriptor's `display.formats`, refusing
 * the descriptor entirely if two keys collapse to the same 4-byte selector.
 *
 * ERC-7730 MUST: "If multiple keys share the same type-only signature, wallets MUST
 * treat this as an invalid descriptor." Function selectors are 4 bytes (≈4.3B values);
 * a malicious descriptor can mine a colliding key whose display rule shadows the
 * legitimate one, so insertion-order iteration would silently render attacker labels
 * for legitimate calldata. Detecting the collision means we can't disambiguate either
 * key, so we abort clear-signing for this contract and fall back to raw decode.
 */
function buildSelectorMap(
  formats: Record<string, DescriptorFormat>
): Map<string, { formatKey: string; format: DescriptorFormat }> | null {
  const map = new Map<string, { formatKey: string; format: DescriptorFormat }>();
  for (const [formatKey, format] of Object.entries(formats)) {
    const sel = selectorForKey(formatKey);
    if (!sel) continue;
    const key = sel.toLowerCase();
    if (map.has(key)) return null;
    map.set(key, { formatKey, format });
  }
  return map;
}

export async function resolveCalldataDescriptor(
  source: DescriptorSource,
  chainId: number,
  to: string,
  data: string
): Promise<CalldataMatch | null> {
  if (!data || data === '0x' || data.length < 10) return null;
  const selector = data.slice(0, 10).toLowerCase();

  let index: CalldataIndex;
  try {
    index = await source.getCalldataIndex();
  } catch {
    return null;
  }

  const path = index[caip10(chainId, to)];
  if (!path) return null;

  let descriptor: Descriptor;
  try {
    descriptor = await source.getDescriptor(path);
  } catch {
    return null;
  }

  const formats = descriptor?.display?.formats;
  if (!formats) return null;

  const selectorMap = buildSelectorMap(formats);
  if (!selectorMap) return null;
  const hit = selectorMap.get(selector);
  if (!hit) return null;
  return { descriptor, formatKey: hit.formatKey, format: hit.format };
}

export interface Eip712Match {
  descriptor: Descriptor;
  formatKey: string;
  format: DescriptorFormat;
}

export type Eip712Types = Record<string, ReadonlyArray<{ name: string; type: string }>>;

/**
 * EIP-712 canonical type encoding.
 * Algorithm: `primaryType(fields...) + dep1(...) + dep2(...)` where deps are
 * the struct types referenced (recursively), sorted alphabetically, deduped,
 * with `primaryType` first.
 */
function encodeEip712Type(types: Eip712Types, primaryType: string): string | null {
  if (!types[primaryType]) return null;
  const deps = new Set<string>();
  const visit = (t: string) => {
    if (deps.has(t) || !types[t]) return;
    deps.add(t);
    for (const f of types[t]) {
      // Strip array suffixes (`Foo[]`, `Foo[2]`) — the base type is what matters for dep walking.
      const base = f.type.replace(/(\[[^\]]*\])+$/, '');
      if (types[base]) visit(base);
    }
  };
  visit(primaryType);
  deps.delete(primaryType);
  const ordered = [primaryType, ...Array.from(deps).sort()];
  return ordered.map((name) => `${name}(${types[name].map((f) => `${f.type} ${f.name}`).join(',')})`).join('');
}

/** Compute the 32-byte EIP-712 type hash for a primaryType, or null if undefined. */
export function eip712TypeHash(types: Eip712Types, primaryType: string): Hex | null {
  const encoded = encodeEip712Type(types, primaryType);
  if (!encoded) return null;
  return keccak256(stringToHex(encoded));
}

/** Normalize a chainId that may arrive as a number, hex string, or decimal string. */
function normalizeChainId(v: unknown): number | undefined {
  if (typeof v === 'number') return v;
  if (typeof v === 'bigint') return Number(v);
  if (typeof v === 'string' && v.length > 0) {
    const n = v.startsWith('0x') ? Number.parseInt(v, 16) : Number(v);
    return Number.isFinite(n) ? n : undefined;
  }
  return undefined;
}

/** Lowercase comparator for hex strings (addresses, bytes32 salt). */
function eqHex(a: unknown, b: unknown): boolean {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  return a.toLowerCase() === b.toLowerCase();
}

/**
 * Verify every key declared in the descriptor's `context.eip712.domain` matches the
 * message domain. ERC-7730 MUST: "each key-value pair in this `domain` binding must
 * match the values of the domain key-value pairs of the message."
 *
 * Why all five fields matter: the same `verifyingContract` address can serve different
 * protocol versions over time, so a descriptor authored against `version: "2"` rendering
 * for a `version: "1"` message is a stale-signature replay vector. Even though CAIP-10
 * lookup uses chainId + verifyingContract, we re-check them here against the *message's*
 * domain — the CAIP-10 inputs are caller-supplied, not the message's own claims.
 */
function descriptorDomainMatches(
  descDomain: NonNullable<NonNullable<Descriptor['context']['eip712']>['domain']> | undefined,
  msgDomain: Record<string, unknown> | undefined
): boolean {
  if (!descDomain) return true;
  if (descDomain.name !== undefined && descDomain.name !== msgDomain?.name) return false;
  if (descDomain.version !== undefined && descDomain.version !== msgDomain?.version) return false;
  if (descDomain.chainId !== undefined && descDomain.chainId !== normalizeChainId(msgDomain?.chainId)) return false;
  if (descDomain.verifyingContract !== undefined && !eqHex(descDomain.verifyingContract, msgDomain?.verifyingContract))
    return false;
  if (descDomain.salt !== undefined && !eqHex(descDomain.salt, msgDomain?.salt)) return false;
  return true;
}

/**
 * Recompute the EIP-712 domain separator from the message domain and verify equality
 * with the descriptor's declared `domainSeparator`. ERC-7730 MUST when declared.
 *
 * Cryptographic backstop to the field-by-field check: catches mismatches in non-standard
 * domain fields the descriptor's `domain` block doesn't enumerate (e.g. a custom `subdomain`
 * slot). Uses viem's `domainSeparator` so the verifier and signer share one canonical
 * encoder — no risk of divergence. Any malformed input (e.g. chainId as hex string viem
 * can't coerce) trips the catch and returns `false`: fail closed.
 */
function domainSeparatorMatches(declared: Hex | undefined, msgDomain: Record<string, unknown> | undefined): boolean {
  if (!declared) return true;
  if (!msgDomain) return false;
  try {
    const computed = domainSeparator({ domain: msgDomain as TypedDataDomain });
    return computed.toLowerCase() === declared.toLowerCase();
  } catch {
    return false;
  }
}

export async function resolveEip712Descriptor(
  source: DescriptorSource,
  chainId: number,
  verifyingContract: string,
  primaryType: string,
  types: Eip712Types,
  messageDomain?: Record<string, unknown>
): Promise<Eip712Match | null> {
  let index: Eip712Index;
  try {
    index = await source.getEip712Index();
  } catch {
    return null;
  }

  const entry = index[caip10(chainId, verifyingContract)];
  const candidates = entry?.[primaryType];
  if (!candidates || candidates.length === 0) return null;

  // Disambiguate by hashing the typed-data struct and matching against each candidate's
  // `encodeTypeHashes`. Without this, an attacker could craft a message that reuses a
  // legitimate primaryType + verifyingContract with a different struct shape and have the
  // legitimate descriptor's labels rendered against the wrong fields.
  //
  // Policy: REQUIRE a computable message typehash AND a candidate that publishes a matching
  // hash. Refuse otherwise. Audit (May 2026) showed 538/538 registry slots publish
  // encodeTypeHashes today; we deliberately refuse hashless entries so a future
  // registry-data regression can't silently downgrade verification.
  const messageTypeHash = eip712TypeHash(types, primaryType);
  if (!messageTypeHash) return null;
  const target = messageTypeHash.toLowerCase();
  const chosen = candidates.find((c) => c.encodeTypeHashes?.some((h) => h.toLowerCase() === target));
  if (!chosen) return null;

  let descriptor: Descriptor;
  try {
    descriptor = await source.getDescriptor(chosen.path);
  } catch {
    return null;
  }

  // ERC-7730 MUST: every key in `context.eip712.domain` must match the message domain.
  if (!descriptorDomainMatches(descriptor.context?.eip712?.domain, messageDomain)) return null;

  // ERC-7730 MUST when declared: recompute the message's domain separator and compare.
  if (!domainSeparatorMatches(descriptor.context?.eip712?.domainSeparator, messageDomain)) return null;

  const formats = descriptor?.display?.formats;
  if (!formats) return null;

  const found = Object.entries(formats).find(([k]) => k.startsWith(`${primaryType}(`));
  if (!found) return null;

  return { descriptor, formatKey: found[0], format: found[1] };
}

// ============================================================================
//  Formatter
// ----------------------------------------------------------------------------
// Apply a matched DescriptorFormat to decoded args / tx envelope and produce
// the DisplayRow[] the UI renders.
//
// Supported field formats (v1):
//   raw          → render verbatim
//   addressName  → render as address (UI handles ENS reverse-resolve)
//   tokenAmount  → decimals + symbol from `params.tokenPath` (on-chain read)
//   amount       → native coin amount with chain symbol
//   date         → timestamp → locale string (blockheight encoding falls back to raw)
//   unit         → params.decimals + params.base + params.prefix
//   nftName / duration / enum / calldata → fall through to raw
// ============================================================================

export interface TokenInfo {
  address: string;
  decimals: number;
  symbol: string;
}

export interface FormatterContext extends PathContext {
  chainId: number;
  resolveToken?: (address: string) => Promise<TokenInfo | null> | TokenInfo | null;
  nativeSymbol?: string;
}

const NATIVE_SENTINELS = new Set([
  '0x0000000000000000000000000000000000000000',
  '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee',
]);

const isNativeSentinel = (addr: string | undefined) => !!addr && NATIVE_SENTINELS.has(addr.toLowerCase());

function resolveRef(descriptor: Descriptor, ref: string): Partial<DescriptorField> | null {
  // `$.display.definitions.sendAmount` → walk the descriptor object.
  const segments = ref.replace(/^\$\./, '').split('.');
  let cur: unknown = descriptor;
  for (const s of segments) {
    if (cur && typeof cur === 'object' && s in (cur as Record<string, unknown>)) {
      cur = (cur as Record<string, unknown>)[s];
    } else {
      return null;
    }
  }
  return (cur as Partial<DescriptorField>) ?? null;
}

function mergeField(descriptor: Descriptor, field: DescriptorField): DescriptorField {
  if (!field.$ref) return field;
  const def = resolveRef(descriptor, field.$ref);
  if (!def) return field;
  return {
    ...def,
    ...field,
    params: { ...(def.params ?? {}), ...(field.params ?? {}) },
  } as DescriptorField;
}

function defaultLabel(field: DescriptorField): string {
  if (field.label) return field.label;
  const segs = field.path.split('.').filter((s) => !s.startsWith('['));
  const last = segs[segs.length - 1] ?? field.path;
  return last
    .replace(/[_-]/g, ' ')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/^\w/, (c) => c.toUpperCase());
}

function asString(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'bigint') return value.toString();
  if (Array.isArray(value)) return `[${value.map(asString).join(', ')}]`;
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

function toBigInt(value: unknown): bigint | null {
  try {
    if (typeof value === 'bigint') return value;
    if (typeof value === 'number') return BigInt(Math.trunc(value));
    if (typeof value === 'string' && value.length > 0) return BigInt(value);
  } catch {
    /* ignore */
  }
  return null;
}

function rawRow(label: string, value: unknown): DisplayRow {
  const v = asString(value);
  const looksLikeAddress = typeof value === 'string' && isAddress(value);
  return {
    label,
    value: v,
    kind: looksLikeAddress ? 'address' : 'raw',
    rawValue: looksLikeAddress ? (value as string) : undefined,
  };
}

/**
 * Thrown when a field's `mustMatch` rule fails. ERC-7730 treats this as a vetting
 * failure (not a display hint) — the descriptor's author scoped their labels to a
 * specific value set and we observed something outside it. Caught in `applyFormat`
 * to abort clear-signing for the whole transaction; the UI then falls back to raw
 * decode rather than presenting the descriptor's labels for an interaction the
 * author didn't vouch for.
 */
class MustMatchViolation extends Error {
  constructor(public readonly field: string) {
    super(`mustMatch violation on field ${field}`);
    this.name = 'MustMatchViolation';
  }
}

/**
 * Case-insensitive (for hex addresses) membership check used by `mustMatch` / `ifNotIn`.
 * Values can be addresses, enum strings, or numeric strings; we normalize both sides to
 * lowercase so descriptor authors don't have to pick a casing convention.
 */
function valueInList(value: unknown, list: string[]): boolean {
  const v = asString(value).toLowerCase();
  return list.some((item) => item.toLowerCase() === v);
}

async function formatField(
  descriptor: Descriptor,
  rawField: DescriptorField,
  ctx: FormatterContext
): Promise<DisplayRow | null> {
  const field = mergeField(descriptor, rawField);

  if (field.visible === false || field.visible === 'never') return null;

  const label = defaultLabel(field);
  const value = resolvePath(field.path, ctx);
  if (value === undefined) return null;

  // ERC-7730 MUST: `mustMatch` violation invalidates the descriptor for this tx.
  // Thrown — `applyFormat` catches and aborts so the UI can fall back to raw decode.
  if (field.mustMatch && field.mustMatch.length > 0 && !valueInList(value, field.mustMatch)) {
    throw new MustMatchViolation(field.path);
  }

  // ERC-7730 visibility filter: `ifNotIn` shows the row only when value is NOT in list.
  if (field.ifNotIn && field.ifNotIn.length > 0 && valueInList(value, field.ifNotIn)) return null;

  switch (field.format ?? 'raw') {
    case 'addressName': {
      if (typeof value !== 'string' || !isAddress(value)) return rawRow(label, value);
      return { label, value, kind: 'address', rawValue: value };
    }

    case 'tokenAmount': {
      const amount = toBigInt(value);
      let tokenAddr: string | undefined;
      if (field.params?.tokenPath) {
        const tokenVal = resolvePath(field.params.tokenPath, ctx);
        if (typeof tokenVal === 'string') tokenAddr = tokenVal;
      }

      if (isNativeSentinel(tokenAddr) || (!tokenAddr && field.params?.nativeCurrencyAddress)) {
        const formatted = amount !== null ? formatUnits(amount, 18) : asString(value);
        return {
          label,
          value: formatted,
          kind: 'tokenAmount',
          symbol: ctx.nativeSymbol ?? 'ETH',
          rawValue: amount?.toString(),
        };
      }

      let info: TokenInfo | null = null;
      if (tokenAddr && ctx.resolveToken) {
        try {
          info = await ctx.resolveToken(tokenAddr);
        } catch {
          info = null;
        }
      }

      if (info && amount !== null) {
        return {
          label,
          value: formatUnits(amount, info.decimals),
          kind: 'tokenAmount',
          symbol: info.symbol,
          rawValue: amount.toString(),
          tokenAddress: tokenAddr,
        };
      }

      // Token denomination unknown (decimals/symbol read failed or token addr missing).
      // Render the raw wei as kind='raw' with no symbol — never pretend we know the unit, since
      // a malicious token could revert decimals() and have the wallet display "1e18" as a tidy
      // "amount" with a token-icon styling.
      return {
        label,
        value: amount !== null ? amount.toString() : asString(value),
        kind: 'raw',
        rawValue: amount?.toString(),
      };
    }

    case 'amount': {
      const amount = toBigInt(value);
      const formatted = amount !== null ? formatUnits(amount, 18) : asString(value);
      return {
        label,
        value: formatted,
        kind: 'amount',
        symbol: ctx.nativeSymbol ?? 'ETH',
        rawValue: amount?.toString(),
      };
    }

    case 'date': {
      const n = toBigInt(value);
      if (n === null || field.params?.encoding === 'blockheight') return rawRow(label, value);
      const date = new Date(Number(n) * 1000);
      if (Number.isNaN(date.getTime())) return rawRow(label, value);
      return { label, value: date.toLocaleString(), kind: 'date', rawValue: n.toString() };
    }

    case 'unit': {
      const n = toBigInt(value);
      if (n === null) return rawRow(label, value);
      const decimals = field.params?.decimals ?? 0;
      const base = typeof field.params?.base === 'string' ? field.params.base : '';
      const prefix = typeof field.params?.prefix === 'string' ? field.params.prefix : '';
      const text = decimals > 0 ? formatUnits(n, decimals) : n.toString();
      return {
        label,
        value: `${prefix}${text}${base ? ` ${base}` : ''}`,
        kind: 'unit',
        rawValue: n.toString(),
      };
    }

    default:
      return rawRow(label, value);
  }
}

function getIntent(format: DescriptorFormat): string | undefined {
  if (typeof format.intent === 'string') return format.intent;
  if (format.intent && typeof format.intent === 'object') {
    const first = Object.values(format.intent)[0];
    return typeof first === 'string' ? first : undefined;
  }
  return undefined;
}

export async function applyFormat(
  descriptor: Descriptor,
  format: DescriptorFormat,
  ctx: FormatterContext
): Promise<ClearSigningDisplay | null> {
  const rows: DisplayRow[] = [];
  try {
    for (const f of format.fields ?? []) {
      // v1: array-iteration fields render as raw (the underlying array literal).
      if (f.path.endsWith('.[]')) {
        const val = resolvePath(f.path, ctx);
        rows.push(rawRow(defaultLabel(mergeField(descriptor, f)), val));
        continue;
      }
      const row = await formatField(descriptor, f, ctx);
      if (row) rows.push(row);
    }
  } catch (err) {
    // ERC-7730: a `mustMatch` violation invalidates the descriptor for this tx.
    // Return null so the hook falls back to raw-decode UI instead of rendering
    // descriptor labels for an interaction the author didn't vouch for.
    if (err instanceof MustMatchViolation) return null;
    throw err;
  }

  const meta = descriptor.metadata ?? {};
  return {
    intent: getIntent(format),
    contractName: meta.contractName ?? descriptor.context?.$id,
    owner: meta.owner ?? meta.info?.legalName,
    ownerUrl: meta.info?.url,
    rows,
  };
}

// ============================================================================
//  Calldata decoding helper
// ----------------------------------------------------------------------------
// Builds an ABI item from the descriptor's signature so viem can decode the
// raw calldata into a {paramName: value} record that path resolution consumes.
// ============================================================================

export interface DecodedArgs {
  abiItem: AbiFunction;
  args: Record<string, unknown>;
}

export function decodeCalldataWithSignature(formatKey: string, data: string): DecodedArgs | null {
  let abiItem: AbiFunction;
  try {
    abiItem = parseAbiItem(`function ${formatKey}`) as AbiFunction;
  } catch {
    return null;
  }

  let decoded;
  try {
    decoded = decodeFunctionData({ abi: [abiItem] as Abi, data: data as Hex });
  } catch {
    return null;
  }

  const args: Record<string, unknown> = {};
  (abiItem.inputs ?? []).forEach((inp, i) => {
    const name = inp.name && inp.name.length > 0 ? inp.name : `arg${i}`;
    args[name] = (decoded.args as readonly unknown[])[i];
  });

  return { abiItem, args };
}

// ============================================================================
//  Shared ERC-20 token resolver
// ----------------------------------------------------------------------------
// Used by useDecodedCalldata (clear-signing branch) and useClearSigningTypedData
// to fetch `decimals()` + `symbol()` from chain. Module-level cache shared across hooks.
// ============================================================================

const tokenCache = new Map<string, TokenInfo | null>();

const ERC20_DECIMALS_SYMBOL = [
  parseAbiItem('function decimals() view returns (uint8)'),
  parseAbiItem('function symbol() view returns (string)'),
] as const;

function jawRpcUrl(chainId: number, apiKey?: string): string {
  return apiKey ? `${JAW_RPC_URL}?chainId=${chainId}&api-key=${apiKey}` : `${JAW_RPC_URL}?chainId=${chainId}`;
}

const clientCache = new Map<string, ReturnType<typeof createPublicClient>>();
function getPublicClient(chainId: number, apiKey?: string) {
  const key = `${chainId}:${apiKey ?? ''}`;
  let client = clientCache.get(key);
  if (!client) {
    client = createPublicClient({ transport: http(jawRpcUrl(chainId, apiKey)) });
    clientCache.set(key, client);
  }
  return client;
}

/** Build a `resolveToken` callback bound to a specific chain (and optional JAW API key). */
export function createTokenResolver(chainId: number, apiKey?: string) {
  const client = getPublicClient(chainId, apiKey);
  return async function resolveToken(address: string): Promise<TokenInfo | null> {
    const key = `${chainId}:${address.toLowerCase()}`;
    if (tokenCache.has(key)) return tokenCache.get(key) ?? null;
    try {
      const [decimals, symbol] = await Promise.all([
        client.readContract({
          address: address as `0x${string}`,
          abi: ERC20_DECIMALS_SYMBOL,
          functionName: 'decimals',
        }),
        client.readContract({
          address: address as `0x${string}`,
          abi: ERC20_DECIMALS_SYMBOL,
          functionName: 'symbol',
        }),
      ]);
      const info: TokenInfo = { address, decimals: Number(decimals), symbol: String(symbol) };
      tokenCache.set(key, info);
      return info;
    } catch {
      tokenCache.set(key, null);
      return null;
    }
  };
}

/** Native-coin symbol for a chain, sourced from viem's chain config via `SUPPORTED_CHAINS`. */
export function getNativeSymbol(chainId: number): string {
  return SUPPORTED_CHAINS.find((c) => c.id === chainId)?.nativeCurrency?.symbol ?? 'ETH';
}
