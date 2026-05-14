import { useEffect, useState } from 'react';
import {
  applyFormat,
  createTokenResolver,
  getDefaultDescriptorSource,
  NATIVE_SYMBOLS,
  resolveEip712Descriptor,
  type ClearSigningDisplay,
} from '../utils/clearSigning';

interface TypedData {
  types: Record<string, Array<{ name: string; type: string }>>;
  primaryType: string;
  domain: Record<string, unknown>;
  message: Record<string, unknown>;
}

interface UseClearSigningTypedDataResult {
  display: ClearSigningDisplay | null;
  isLoading: boolean;
}

/**
 * Resolve an ERC-7730 descriptor for `(chainId, verifyingContract, primaryType)`
 * and produce a ClearSigningDisplay over the typed-data message.
 * Returns `display: null` when no descriptor matches.
 */
export function useClearSigningTypedData(
  typedDataJson: string | undefined,
  chainId: number,
  apiKey?: string
): UseClearSigningTypedDataResult {
  const [display, setDisplay] = useState<ClearSigningDisplay | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (!typedDataJson) {
      setDisplay(null);
      setIsLoading(false);
      return;
    }

    let parsed: TypedData;
    try {
      parsed = JSON.parse(typedDataJson) as TypedData;
    } catch {
      setDisplay(null);
      setIsLoading(false);
      return;
    }

    const verifyingContract = parsed.domain?.verifyingContract as string | undefined;
    const primaryType = parsed.primaryType;
    if (!verifyingContract || !primaryType) {
      setDisplay(null);
      setIsLoading(false);
      return;
    }

    let cancelled = false;
    setIsLoading(true);

    (async () => {
      try {
        const match = await resolveEip712Descriptor(
          getDefaultDescriptorSource(),
          chainId,
          verifyingContract,
          primaryType,
          parsed.types
        );
        if (cancelled) return;
        if (!match) {
          setDisplay(null);
          setIsLoading(false);
          return;
        }

        const result = await applyFormat(match.descriptor, match.format, {
          args: { ...parsed.message },
          tx: { chainId, verifyingContract: verifyingContract.toLowerCase(), ...parsed.domain },
          chainId,
          nativeSymbol: NATIVE_SYMBOLS[chainId] ?? 'ETH',
          resolveToken: createTokenResolver(chainId, apiKey),
        });

        if (!cancelled) {
          setDisplay(result);
          setIsLoading(false);
        }
      } catch (err) {
        console.debug('[useClearSigningTypedData] resolve failed:', err);
        if (!cancelled) {
          setDisplay(null);
          setIsLoading(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [typedDataJson, chainId, apiKey]);

  return { display, isLoading };
}
