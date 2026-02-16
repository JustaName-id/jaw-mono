import { useState, useEffect } from 'react';
import { createPublicClient, http, decodeFunctionData, type Abi, type Hex } from 'viem';
import { whatsabi } from '@shazow/whatsabi';
import { JAW_RPC_URL } from '@jaw.id/core';

export interface DecodedParam {
  name: string;
  type: string;
  value: string;
}

export interface DecodedCalldata {
  functionName: string;
  signature: string;
  params: DecodedParam[];
}

// Module-level ABI cache keyed by lowercase address
const abiCache = new Map<string, Abi>();

// Deduplicates concurrent fetches for the same contract
const inflightRequests = new Map<string, Promise<Abi>>();

async function fetchAbi(address: string, rpcUrl: string): Promise<Abi> {
  const key = address.toLowerCase();

  const cached = abiCache.get(key);
  if (cached) return cached;

  const inflight = inflightRequests.get(key);
  if (inflight) return inflight;

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

  inflightRequests.set(key, promise);
  try {
    return await promise;
  } finally {
    inflightRequests.delete(key);
  }
}

function formatParamValue(value: unknown): string {
  if (typeof value === 'bigint') return value.toString();
  if (Array.isArray(value)) return `[${value.map(formatParamValue).join(', ')}]`;
  if (typeof value === 'object' && value !== null) return JSON.stringify(value);
  return String(value);
}

export function useDecodedCalldata(
  to: string | undefined,
  data: string | undefined,
  chainId: number,
  apiKey?: string
): { decoded: DecodedCalldata | null; isLoading: boolean } {
  const [decoded, setDecoded] = useState<DecodedCalldata | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  // Early return conditions checked inside useEffect to keep hook call order stable
  useEffect(() => {
    if (!to || !data || data === '0x' || data.length < 10) {
      setDecoded(null);
      setIsLoading(false);
      return;
    }

    let isMounted = true;

    const decode = async () => {
      setIsLoading(true);
      try {
        const rpcUrl = apiKey
          ? `${JAW_RPC_URL}?chainId=${chainId}&api-key=${apiKey}`
          : `${JAW_RPC_URL}?chainId=${chainId}`;

        const abi = await fetchAbi(to, rpcUrl);
        if (!isMounted) return;

        const { functionName, args } = decodeFunctionData({ abi, data: data as Hex });

        // Find the matching ABI entry to get parameter names/types
        const abiItem = abi.find(
          (item) => 'name' in item && item.name === functionName && item.type === 'function'
        );

        const inputs = abiItem && 'inputs' in abiItem ? abiItem.inputs ?? [] : [];

        const params: DecodedParam[] = (args ?? []).map((arg, i) => ({
          name: inputs[i]?.name || `param${i}`,
          type: inputs[i]?.type || 'unknown',
          value: formatParamValue(arg),
        }));

        const signature = `${functionName}(${inputs.map((inp) => inp.type).join(', ')})`;

        if (isMounted) {
          setDecoded({ functionName, signature, params });
          setIsLoading(false);
        }
      } catch (err) {
        console.debug('[useDecodedCalldata] Failed to decode:', err);
        if (isMounted) {
          setDecoded(null);
          setIsLoading(false);
        }
      }
    };

    decode();

    return () => {
      isMounted = false;
    };
  }, [to, data, chainId, apiKey]);

  return { decoded, isLoading };
}
