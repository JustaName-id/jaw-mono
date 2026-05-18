import { useEffect, useState } from 'react';
import {
  applyFormat,
  createTokenResolver,
  getDefaultDescriptorSource,
  getNativeSymbol,
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
          parsed.types,
          parsed.domain
        );
        if (cancelled) return;
        if (!match) {
          setDisplay(null);
          setIsLoading(false);
          return;
        }

        const result = await applyFormat(match.descriptor, match.format, {
          args: { ...parsed.message },
          // Spread parsed.domain first so the hook's normalized values (lower-cased
          // verifyingContract, numeric chainId) win when a dApp ships a differently-cased
          // address or a hex chainId. Renderer reads from this; we don't want descriptor
          // rows to surface dApp-controlled spelling.
          tx: { ...parsed.domain, chainId, verifyingContract: verifyingContract.toLowerCase() },
          chainId,
          nativeSymbol: getNativeSymbol(chainId),
          resolveToken: createTokenResolver(chainId, apiKey),
        });

        if (!cancelled) {
          // applyFormat → null means a mustMatch violation; surface as "no descriptor"
          // so the dialog falls back to raw decode.
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
