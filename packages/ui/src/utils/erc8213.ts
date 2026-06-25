// ============================================================================
// ERC-8213 — Wallet Signature & Calldata Digest Display
// ----------------------------------------------------------------------------
// Display-only standard: derive short, reproducible cryptographic fingerprints
// of what is being signed so a signer can independently recompute and verify
// them. This module is purely additive — it does NOT participate in signing.
// It complements the ERC-7730 clear-signing engine (clearSigning.ts): 7730
// produces a human-readable description, 8213 produces a self-verifiable hash.
//
// Digest formulas (spec):
//   EIP-712 Digest = keccak256(0x1901 ‖ domainSeparator ‖ hashStruct(message))
//   Domain Hash    = hashStruct(eip712Domain)
//   Message Hash   = hashStruct(message)
//   Calldata Digest= keccak256(uint256(len(calldata)) ‖ calldata)
//                    (length-prefixed; chainId intentionally excluded)
//
// Consumed by: components/Eip712Dialog (the three EIP-712 digests) and
// components/TransactionDialog/DecodedCalldata (the calldata digest).
// ============================================================================

import {
  concat,
  hashDomain,
  hashStruct,
  hashTypedData,
  keccak256,
  pad,
  size,
  toHex,
  type Hex,
  type TypedData,
  type TypedDataDomain,
  type TypedDataParameter,
} from 'viem';

// Loose typed-data shape. viem's `TypedData` carries a strict index signature
// that rejects a spread-with-extra-key, so we model parsed JSON loosely and
// cast to `TypedData` only at the viem call boundary.
type LooseTypes = Record<string, readonly TypedDataParameter[]>;

export interface Eip712Digests {
  /** keccak256(0x1901 ‖ domainSeparator ‖ hashStruct(message)) — the value actually signed. */
  eip712Digest: Hex;
  /** hashStruct of the EIP712Domain — the domain separator. */
  domainHash: Hex;
  /** hashStruct of the message struct. */
  messageHash: Hex;
}

interface ParsedTypedData {
  types: LooseTypes;
  primaryType: string;
  domain: TypedDataDomain;
  message: Record<string, unknown>;
}

// Standard EIP-712 domain field → solidity type, in canonical order. Used to
// reconstruct the `EIP712Domain` type definition when a typed-data payload omits
// it (some dApps do), so the domain hash stays computable.
const EIP712_DOMAIN_FIELDS: ReadonlyArray<{ name: keyof TypedDataDomain; type: string }> = [
  { name: 'name', type: 'string' },
  { name: 'version', type: 'string' },
  { name: 'chainId', type: 'uint256' },
  { name: 'verifyingContract', type: 'address' },
  { name: 'salt', type: 'bytes32' },
];

/**
 * Return a `types` record guaranteed to contain an `EIP712Domain` entry. If the
 * payload already declares one, it's used verbatim; otherwise we derive it from
 * the domain fields that are present, matching how viem's `hashTypedData`
 * implicitly handles a missing domain type.
 */
function withDomainType(types: LooseTypes, domain: TypedDataDomain): LooseTypes {
  if (types.EIP712Domain) return types;
  const derived = EIP712_DOMAIN_FIELDS.filter((f) => domain[f.name] !== undefined).map((f) => ({
    name: f.name as string,
    type: f.type,
  }));
  return { ...types, EIP712Domain: derived };
}

/**
 * Parse an EIP-712 typed-data JSON string and compute the three ERC-8213
 * digests. Throws if the JSON is malformed (callers should guard with the same
 * try/catch they already use to parse typed data for display).
 */
export function computeEip712Digests(typedDataJson: string): Eip712Digests {
  const parsed = JSON.parse(typedDataJson) as ParsedTypedData;
  const { primaryType, domain, message } = parsed;
  // `domainTypes` keeps EIP712Domain (deriving it when absent) for the domain/full
  // hashes; `messageTypes` strips it so the message hash encodes only the message's
  // own struct graph. Including EIP712Domain in the message hash is a classic
  // pitfall: strict libraries refuse it and ad-hoc ones silently hash differently.
  const domainTypes = withDomainType(parsed.types, domain) as TypedData;
  const messageTypes: TypedData = { ...domainTypes };
  delete (messageTypes as Record<string, unknown>).EIP712Domain;

  return {
    eip712Digest: hashTypedData({ domain, types: domainTypes, primaryType, message }),
    domainHash: hashDomain({ domain, types: domainTypes }),
    messageHash: hashStruct({ data: message, primaryType, types: messageTypes }),
  };
}

/**
 * Calldata Digest = keccak256( uint256(len(calldata)) ‖ calldata ).
 * The 32-byte big-endian length prefix binds the digest to the exact byte
 * length; chainId is intentionally excluded by the spec.
 */
export function computeCalldataDigest(data: Hex): Hex {
  return keccak256(concat([pad(toHex(size(data)), { size: 32 }), data]));
}
