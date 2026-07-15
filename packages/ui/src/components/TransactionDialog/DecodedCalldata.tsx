import { useState, useEffect, useRef, useMemo } from 'react';
import type { Hex } from 'viem';
import { useDecodedCalldata } from '../../hooks/useDecodedCalldata';
import { Spinner } from '../ui/spinner';
import { reverseResolveWithAvatars, formatAddress, getChainLabel } from '../../utils';
import { computeCalldataDigest } from '../../utils/erc8213';
import { IdentityAvatar } from '../IdentityAvatar';
import { TokenIcon } from '../TokenIcon';
import { DigestRow } from '../VerificationDigest';
import { ClearSignedView } from './ClearSignedView';

const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000';

/**
 * ERC-8213 Calldata Digest, collapsed behind a disclosure like the raw calldata
 * view. Shown only for non-empty calldata; the spec omits the digest when
 * calldata is empty (`0x`/undefined).
 */
const CalldataDigest = ({ data }: { data: string }) => {
  const digest = useMemo(() => {
    if (!data || data === '0x') return null;
    try {
      return computeCalldataDigest(data as Hex);
    } catch {
      return null;
    }
  }, [data]);

  if (!digest) return null;
  return (
    <details className="text-xs">
      <summary className="text-muted-foreground hover:text-foreground cursor-pointer">Show calldata digest</summary>
      <div className="mt-2">
        <DigestRow label="Calldata Digest" value={digest} />
      </div>
    </details>
  );
};

/** Merge parent-resolved and locally-resolved maps, normalizing all keys to lowercase. */
function mergeLowercased(
  parent: Record<string, string> | undefined,
  local: Record<string, string>
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(parent ?? {})) out[key.toLowerCase()] = value;
  for (const [key, value] of Object.entries(local)) out[key.toLowerCase()] = value;
  return out;
}

interface DecodedCalldataProps {
  to: string;
  data: string;
  chainId: number;
  apiKey?: string;
  resolvedAddresses?: Record<string, string>;
  resolvedAvatars?: Record<string, string>;
  mainnetRpcUrl?: string;
}

export const DecodedCalldata = ({
  to,
  data,
  chainId,
  apiKey,
  resolvedAddresses,
  resolvedAvatars,
  mainnetRpcUrl,
}: DecodedCalldataProps) => {
  // One hook handles both pipelines: ERC-7730 clear-signing (preferred view) and
  // whatsabi raw decode (fallback / "Show raw details" disclosure).
  const { clearSigned, decoded, isLoading } = useDecodedCalldata(to, data, chainId, apiKey);
  const [localResolved, setLocalResolved] = useState<Record<string, string>>({});
  const [localAvatars, setLocalAvatars] = useState<Record<string, string>>({});
  const attemptedRef = useRef<Set<string>>(new Set());

  // Reset local state when decoded data changes identity (new transaction)
  const decodedIdRef = useRef(decoded);
  useEffect(() => {
    if (decodedIdRef.current !== decoded) {
      decodedIdRef.current = decoded;
      setLocalResolved({});
      setLocalAvatars({});
      attemptedRef.current = new Set();
    }
  }, [decoded]);

  const allResolved = useMemo(
    () => mergeLowercased(resolvedAddresses, localResolved),
    [resolvedAddresses, localResolved]
  );
  const allAvatars = useMemo(() => mergeLowercased(resolvedAvatars, localAvatars), [resolvedAvatars, localAvatars]);

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

    let cancelled = false;
    reverseResolveWithAvatars(
      unique.map((address) => ({ address, chainId })),
      mainnetRpcUrl
    )
      .then(async (resolved) => {
        if (cancelled) return;
        const label = await getChainLabel(chainId, mainnetRpcUrl);
        if (cancelled) return;
        const next: Record<string, string> = {};
        const avatarByAddress: Record<string, string> = {};
        for (const address of unique) {
          const identity = resolved[address.toLowerCase()];
          if (!identity) continue;
          next[address.toLowerCase()] = label ? `${identity.name}@${label}` : identity.name;
          if (identity.avatar) avatarByAddress[address.toLowerCase()] = identity.avatar;
        }
        if (Object.keys(next).length > 0) {
          setLocalResolved((prev) => ({ ...prev, ...next }));
        }
        if (Object.keys(avatarByAddress).length > 0) {
          setLocalAvatars((prev) => ({ ...prev, ...avatarByAddress }));
        }
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [decoded, mainnetRpcUrl, chainId]);

  // Clear-signing hit: render the formatted view, with raw whatsabi details collapsed underneath.
  if (clearSigned && clearSigned.rows.length > 0) {
    return (
      <div className="flex flex-col gap-2">
        <ClearSignedView display={clearSigned} chainId={chainId} mainnetRpcUrl={mainnetRpcUrl} />
        <details className="text-xs">
          <summary className="text-muted-foreground hover:text-foreground cursor-pointer">Show raw details</summary>
          <div className="mt-1 flex flex-col gap-2">
            {decoded ? (
              <>
                <div className="flex items-center gap-2">
                  <span className="text-foreground bg-primary/10 rounded px-2 py-0.5 text-xs font-semibold">
                    {decoded.functionName}
                  </span>
                  <span className="text-muted-foreground font-mono text-xs">{decoded.signature}</span>
                </div>
                {decoded.params.length > 0 && (
                  <div className="bg-secondary flex flex-col gap-1 rounded-[6px] p-2">
                    {decoded.params.map((param, i) => (
                      <div key={i} className="flex flex-col gap-0.5">
                        <div className="flex items-baseline gap-1.5">
                          <span className="text-muted-foreground text-xs font-semibold">{param.name}</span>
                          <span className="text-muted-foreground/60 font-mono text-[10px]">{param.type}</span>
                        </div>
                        <p className="text-foreground break-all font-mono text-xs leading-[150%]">{param.value}</p>
                      </div>
                    ))}
                  </div>
                )}
              </>
            ) : null}
            <div className="bg-secondary max-h-[20vh] overflow-y-auto rounded-[6px] p-2">
              <p className="text-foreground break-all font-mono text-xs leading-[150%]">{data}</p>
            </div>
          </div>
        </details>
        <CalldataDigest data={data} />
      </div>
    );
  }

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
      <div className="flex flex-col gap-2">
        <div className="bg-secondary max-h-[40vh] overflow-y-auto rounded-[6px] p-2.5">
          <p className="text-foreground break-all font-mono text-xs font-semibold leading-[150%]">{data}</p>
        </div>
        <CalldataDigest data={data} />
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
            const resolvedAvatar = param.rawValue ? allAvatars[param.rawValue.toLowerCase()] : undefined;
            return (
              <div key={i} className="flex flex-col gap-0.5">
                <div className="flex items-baseline gap-1.5">
                  <span className="text-muted-foreground text-xs font-semibold">{param.name}</span>
                  <span className="text-muted-foreground/60 font-mono text-[10px]">{param.type}</span>
                </div>
                <div className="flex flex-row items-center gap-1">
                  {resolvedAvatar && <IdentityAvatar src={resolvedAvatar} fallback={null} />}
                  <p className="text-foreground break-all font-mono text-xs leading-[150%]">
                    {resolvedName ? `${resolvedName} (${formatAddress(param.rawValue!)})` : param.value}
                  </p>
                  {param.rawValue && param.rawValue.toLowerCase() !== ZERO_ADDRESS && !resolvedAvatar && (
                    // Address params with no ENS avatar: known token contracts get their logo after the address.
                    // The zero address is excluded — tokenIconUrl maps it to the native icon, wrong for calldata params.
                    <TokenIcon chainId={chainId} address={param.rawValue} className="size-4" />
                  )}
                </div>
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

      <CalldataDigest data={data} />
    </div>
  );
};
