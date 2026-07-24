// ============================================================================
//  EIP-712 resolver
// ----------------------------------------------------------------------------
// Match a typed-data signature against the registry, returning the descriptor
// + the specific format spec to apply.
// ============================================================================

import { domainSeparator, keccak256, stringToHex, type Hex, type TypedDataDomain } from 'viem';
import { caip10, eqHex, loadDescriptor, type DescriptorSource } from './source';
import type { Descriptor, Eip712Index, Eip712Match, Eip712Types } from './types';

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
    descriptor = await loadDescriptor(source, chosen.path);
  } catch {
    return null;
  }

  // Defense-in-depth: when the descriptor binds via `eip712.deployments` (rather than
  // inlining chainId/verifyingContract in `context.eip712.domain`), verify the message's
  // (chainId, verifyingContract) is in that array — same registry-data regression class
  // as the calldata-side check.
  const eip712Deployments = descriptor.context?.eip712?.deployments;
  if (
    eip712Deployments &&
    !eip712Deployments.some((d) => d.chainId === chainId && eqHex(d.address, verifyingContract))
  ) {
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
