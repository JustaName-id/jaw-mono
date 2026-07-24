import { useEffect, useState } from 'react';
import {
  applyFormat,
  createTokenResolver,
  getDefaultDescriptorSource,
  getNativeDecimals,
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

/** Coerce an EIP-712 domain chainId (number, bigint, hex or decimal string) to a number. */
function toChainId(v: unknown): number | undefined {
  if (typeof v === 'number') return v;
  if (typeof v === 'bigint') return Number(v);
  if (typeof v === 'string' && v.length > 0) {
    const n = v.startsWith('0x') ? Number.parseInt(v, 16) : Number(v);
    return Number.isFinite(n) ? n : undefined;
  }
  return undefined;
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

    // A typed-data signature is bound to the chain in its own `domain`, not to whatever
    // chain the wallet happens to be connected to. Resolve the descriptor (and read token
    // metadata) against the domain's chainId; fall back to the connected chain when absent.
    const effectiveChainId = toChainId(parsed.domain?.chainId) ?? chainId;

    let cancelled = false;
    setIsLoading(true);

    (async () => {
      try {
        const match = await resolveEip712Descriptor(
          getDefaultDescriptorSource(),
          effectiveChainId,
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
          tx: { ...parsed.domain, chainId: effectiveChainId, verifyingContract: verifyingContract.toLowerCase() },
          chainId: effectiveChainId,
          nativeSymbol: getNativeSymbol(effectiveChainId),
          nativeDecimals: getNativeDecimals(effectiveChainId),
          resolveToken: createTokenResolver(effectiveChainId, apiKey),
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
