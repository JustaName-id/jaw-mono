// ============================================================================
//  Calldata resolver + decoding helper
// ----------------------------------------------------------------------------
// Match a transaction against the registry, returning the descriptor + the
// specific format spec to apply, and build an ABI item from the descriptor's
// signature so viem can decode the raw calldata into a {paramName: value}
// record that path resolution consumes.
// ============================================================================

import { decodeFunctionData, parseAbiItem, toFunctionSelector, type Abi, type AbiFunction, type Hex } from 'viem';
import { caip10, eqHex, loadDescriptor, type DescriptorSource } from './source';
import type { CalldataIndex, CalldataMatch, DecodedArgs, Descriptor, DescriptorFormat } from './types';

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
    descriptor = await loadDescriptor(source, path);
  } catch {
    return null;
  }

  // Defense-in-depth: CAIP-10 index pointed us here, but verify the descriptor's own
  // `deployments` agrees. Catches a registry-data regression where the index maps
  // (chainId, to) to a descriptor whose deployments array doesn't include them.
  const contractDeployments = descriptor.context?.contract?.deployments;
  if (contractDeployments && !contractDeployments.some((d) => d.chainId === chainId && eqHex(d.address, to))) {
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
