import { useState, useEffect, useRef, useMemo } from 'react';
import { useDecodedCalldata } from '../../hooks/useDecodedCalldata';
import { Spinner } from '../ui/spinner';
import { getJustaNameInstance, formatAddress } from '../../utils';

const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000';

interface DecodedCalldataProps {
  to: string;
  data: string;
  chainId: number;
  apiKey?: string;
  resolvedAddresses?: Record<string, string>;
  mainnetRpcUrl?: string;
}

export const DecodedCalldata = ({ to, data, chainId, apiKey, resolvedAddresses, mainnetRpcUrl }: DecodedCalldataProps) => {
  const { decoded, isLoading } = useDecodedCalldata(to, data, chainId, apiKey);
  const [localResolved, setLocalResolved] = useState<Record<string, string>>({});
  const attemptedRef = useRef<Set<string>>(new Set());

  // Reset local state when decoded data changes identity (new transaction)
  const decodedIdRef = useRef(decoded);
  useEffect(() => {
    if (decodedIdRef.current !== decoded) {
      decodedIdRef.current = decoded;
      setLocalResolved({});
      attemptedRef.current = new Set();
    }
  }, [decoded]);

  // Normalize parent-resolved addresses to lowercase keys, then merge with local
  const allResolved = useMemo(() => {
    const normalized: Record<string, string> = {};
    if (resolvedAddresses) {
      for (const [key, value] of Object.entries(resolvedAddresses)) {
        normalized[key.toLowerCase()] = value;
      }
    }
    for (const [key, value] of Object.entries(localResolved)) {
      normalized[key.toLowerCase()] = value;
    }
    return normalized;
  }, [resolvedAddresses, localResolved]);

  // Keep a ref to allResolved so the effect can read it without re-triggering
  const allResolvedRef = useRef(allResolved);
  allResolvedRef.current = allResolved;

  // Resolve address params that aren't already resolved
  useEffect(() => {
    if (!decoded || !mainnetRpcUrl) return;

    const currentResolved = allResolvedRef.current;
    const addressParams = decoded.params
      .filter((p) => p.type === 'address' && p.rawValue)
      .map((p) => p.rawValue!)
      .filter((addr) => {
        const lower = addr.toLowerCase();
        return lower !== ZERO_ADDRESS && !currentResolved[lower] && !attemptedRef.current.has(lower);
      });

    // Deduplicate
    const unique = [...new Set(addressParams)];
    if (unique.length === 0) return;

    // Mark as attempted immediately to prevent re-fetching
    unique.forEach((addr) => attemptedRef.current.add(addr.toLowerCase()));

    const justaName = getJustaNameInstance(mainnetRpcUrl);

    unique.forEach((address) => {
      justaName.subnames
        .reverseResolve({
          address: address as `0x${string}`,
          chainId,
        })
        .then((result) => {
          if (result) {
            setLocalResolved((prev) => ({ ...prev, [address.toLowerCase()]: result }));
          }
        })
        .catch(() => {
          // Silently fail - will show raw address
        });
    });
  }, [decoded, mainnetRpcUrl, chainId]);

  if (isLoading) {
    return (
      <div className="flex flex-col gap-2">
        <div className="flex items-center gap-2">
          <Spinner className="size-3" />
          <span className="text-xs text-muted-foreground">Decoding calldata...</span>
        </div>
        <div className="p-2.5 bg-secondary rounded-[6px] max-h-[40vh] overflow-y-auto opacity-50">
          <p className="text-xs font-semibold leading-[150%] break-all text-foreground font-mono">
            {data}
          </p>
        </div>
      </div>
    );
  }

  if (!decoded) {
    return (
      <div className="p-2.5 bg-secondary rounded-[6px] max-h-[40vh] overflow-y-auto">
        <p className="text-xs font-semibold leading-[150%] break-all text-foreground font-mono">
          {data}
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-2">
        <span className="text-xs font-semibold text-foreground bg-primary/10 px-2 py-0.5 rounded">
          {decoded.functionName}
        </span>
        <span className="text-xs text-muted-foreground font-mono">
          {decoded.signature}
        </span>
      </div>

      {decoded.params.length > 0 && (
        <div className="flex flex-col gap-1 p-2 bg-secondary rounded-[6px]">
          {decoded.params.map((param, i) => {
            const resolvedName = param.rawValue ? allResolved[param.rawValue.toLowerCase()] : undefined;
            return (
              <div key={i} className="flex flex-col gap-0.5">
                <div className="flex items-baseline gap-1.5">
                  <span className="text-xs font-semibold text-muted-foreground">{param.name}</span>
                  <span className="text-[10px] text-muted-foreground/60 font-mono">{param.type}</span>
                </div>
                <p className="text-xs font-mono break-all text-foreground leading-[150%]">
                  {resolvedName
                    ? `${resolvedName} (${formatAddress(param.rawValue!)})`
                    : param.value}
                </p>
              </div>
            );
          })}
        </div>
      )}

      <details className="text-xs">
        <summary className="text-muted-foreground cursor-pointer hover:text-foreground">
          Raw calldata
        </summary>
        <div className="p-2 bg-secondary rounded-[6px] mt-1 max-h-[20vh] overflow-y-auto">
          <p className="text-xs font-mono leading-[150%] break-all text-foreground">
            {data}
          </p>
        </div>
      </details>
    </div>
  );
};
