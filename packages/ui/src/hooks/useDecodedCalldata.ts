import { useEffect, useState } from 'react';
import { createPublicClient, decodeFunctionData, http, type Abi, type Hex } from 'viem';
import { whatsabi } from '@shazow/whatsabi';
import { JAW_RPC_URL } from '@jaw.id/core';
import {
  applyFormat,
  createTokenResolver,
  decodeCalldataWithSignature,
  getDefaultDescriptorSource,
  getNativeSymbol,
  resolveCalldataDescriptor,
  type ClearSigningDisplay,
} from '../utils/clearSigning';

export interface DecodedParam {
  name: string;
  type: string;
  value: string;
  rawValue?: string;
}

export interface DecodedCalldata {
  functionName: string;
  signature: string;
  params: DecodedParam[];
}

/**
 * Result of attempting to decode calldata.
 * - `clearSigned` is set when the contract has an ERC-7730 descriptor in the public registry.
 * - `decoded` is set when whatsabi's bytecode-based ABI extraction succeeds.
 * Both may be set: the clear-signed view renders on top, the raw view sits under "Show raw details".
 * Neither may be set if the contract is unknown to both pipelines.
 */
export interface DecodeResult {
  clearSigned: ClearSigningDisplay | null;
  decoded: DecodedCalldata | null;
  isLoading: boolean;
}

const abiCache = new Map<string, Abi>();
const abiInflight = new Map<string, Promise<Abi>>();

async function fetchAbi(address: string, rpcUrl: string): Promise<Abi> {
  const key = address.toLowerCase();
  const cached = abiCache.get(key);
  if (cached) return cached;

  const existing = abiInflight.get(key);
  if (existing) return existing;

  const promise = (async () => {
    const client = createPublicClient({ transport: http(rpcUrl) });
    const result = await whatsabi.autoload(address, {
      provider: client,
      followProxies: true,
      abiLoader: false,
      signatureLookup: new whatsabi.loaders.OpenChainSignatureLookup(),
    });
    const abi = result.abi as Abi;
    abiCache.set(key, abi);
    return abi;
  })();

  abiInflight.set(key, promise);
  try {
    return await promise;
  } finally {
    abiInflight.delete(key);
  }
}

function formatParamValue(value: unknown): string {
  if (typeof value === 'bigint') return value.toString();
  if (Array.isArray(value)) return `[${value.map(formatParamValue).join(', ')}]`;
  if (typeof value === 'object' && value !== null) return JSON.stringify(value);
  return String(value);
}

async function rawDecode(to: string, data: string, rpcUrl: string): Promise<DecodedCalldata | null> {
  try {
    const abi = await fetchAbi(to, rpcUrl);
    const { functionName, args } = decodeFunctionData({ abi, data: data as Hex });
    const abiItem = abi.find((item) => 'name' in item && item.name === functionName && item.type === 'function');
    const inputs = abiItem && 'inputs' in abiItem ? (abiItem.inputs ?? []) : [];
    const params: DecodedParam[] = (args ?? []).map((arg, i) => ({
      name: inputs[i]?.name || `param${i}`,
      type: inputs[i]?.type || 'unknown',
      value: formatParamValue(arg),
      ...(inputs[i]?.type === 'address' && typeof arg === 'string' ? { rawValue: arg } : {}),
    }));
    return {
      functionName,
      signature: `${functionName}(${inputs.map((inp) => inp.type).join(', ')})`,
      params,
    };
  } catch (err) {
    console.debug('[useDecodedCalldata] raw decode failed:', err);
    return null;
  }
}

async function clearSignedDecode(
  to: string,
  data: string,
  chainId: number,
  apiKey: string | undefined
): Promise<ClearSigningDisplay | null> {
  const match = await resolveCalldataDescriptor(getDefaultDescriptorSource(), chainId, to, data);
  if (!match) return null;
  const decoded = decodeCalldataWithSignature(match.formatKey, data);
  if (!decoded) return null;
  return applyFormat(match.descriptor, match.format, {
    args: decoded.args,
    tx: { to: to.toLowerCase(), chainId },
    chainId,
    nativeSymbol: getNativeSymbol(chainId),
    resolveToken: createTokenResolver(chainId, apiKey),
  });
}

const EMPTY: DecodeResult = { clearSigned: null, decoded: null, isLoading: false };
const LOADING: DecodeResult = { clearSigned: null, decoded: null, isLoading: true };

export function useDecodedCalldata(
  to: string | undefined,
  data: string | undefined,
  chainId: number,
  apiKey?: string
): DecodeResult {
  const [result, setResult] = useState<DecodeResult>(EMPTY);

  useEffect(() => {
    if (!to || !data || data === '0x' || data.length < 10) {
      setResult(EMPTY);
      return;
    }

    let cancelled = false;
    setResult(LOADING);

    const rpcUrl = apiKey ? `${JAW_RPC_URL}?chainId=${chainId}&api-key=${apiKey}` : `${JAW_RPC_URL}?chainId=${chainId}`;

    // Both pipelines run in parallel so the "Show raw details" disclosure is instant when opened.
    Promise.all([clearSignedDecode(to, data, chainId, apiKey), rawDecode(to, data, rpcUrl)])
      .then(([clearSigned, decoded]) => {
        if (!cancelled) setResult({ clearSigned, decoded, isLoading: false });
      })
      .catch((err) => {
        console.debug('[useDecodedCalldata] decode failed:', err);
        if (!cancelled) setResult(EMPTY);
      });

    return () => {
      cancelled = true;
    };
  }, [to, data, chainId, apiKey]);

  return result;
}
