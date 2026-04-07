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

export const DecodedCalldata = ({
  to,
  data,
  chainId,
  apiKey,
  resolvedAddresses,
  mainnetRpcUrl,
}: DecodedCalldataProps) => {
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
          <span className="text-muted-foreground text-xs">Decoding calldata...</span>
        </div>
        <div className="bg-secondary max-h-[40vh] overflow-y-auto rounded-[6px] p-2.5 opacity-50">
          <p className="text-foreground break-all font-mono text-xs font-semibold leading-[150%]">{data}</p>
        </div>
      </div>
    );
  }

  if (!decoded) {
    return (
      <div className="bg-secondary max-h-[40vh] overflow-y-auto rounded-[6px] p-2.5">
        <p className="text-foreground break-all font-mono text-xs font-semibold leading-[150%]">{data}</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-2">
        <span className="text-foreground bg-primary/10 rounded px-2 py-0.5 text-xs font-semibold">
          {decoded.functionName}
        </span>
        <span className="text-muted-foreground font-mono text-xs">{decoded.signature}</span>
      </div>

      {decoded.params.length > 0 && (
        <div className="bg-secondary flex flex-col gap-1 rounded-[6px] p-2">
          {decoded.params.map((param, i) => {
            const resolvedName = param.rawValue ? allResolved[param.rawValue.toLowerCase()] : undefined;
            return (
              <div key={i} className="flex flex-col gap-0.5">
                <div className="flex items-baseline gap-1.5">
                  <span className="text-muted-foreground text-xs font-semibold">{param.name}</span>
                  <span className="text-muted-foreground/60 font-mono text-[10px]">{param.type}</span>
                </div>
                <p className="text-foreground break-all font-mono text-xs leading-[150%]">
                  {resolvedName ? `${resolvedName} (${formatAddress(param.rawValue!)})` : param.value}
                </p>
              </div>
            );
          })}
        </div>
      )}

      <details className="text-xs">
        <summary className="text-muted-foreground hover:text-foreground cursor-pointer">Raw calldata</summary>
        <div className="bg-secondary mt-1 max-h-[20vh] overflow-y-auto rounded-[6px] p-2">
          <p className="text-foreground break-all font-mono text-xs leading-[150%]">{data}</p>
        </div>
      </details>
    </div>
  );
};
