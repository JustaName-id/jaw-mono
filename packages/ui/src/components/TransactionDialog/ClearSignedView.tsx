import { useEffect, useRef, useState } from 'react';
import { ethAddress } from 'viem';
import type { ClearSigningDisplay, DisplayRow } from '../../utils/clearSigning';
import { reverseResolveWithAvatars, formatAddress, getChainLabel } from '../../utils';
import { IdentityAvatar } from '../IdentityAvatar';
import { TokenIcon } from '../TokenIcon';

interface ClearSignedViewProps {
  display: ClearSigningDisplay;
  chainId: number;
  mainnetRpcUrl?: string;
}

function formatGrouped(value: string): string {
  const [intPart, fracPart] = value.split('.');
  const grouped = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return fracPart ? `${grouped}.${fracPart}` : grouped;
}

function TokenAmountValue({ row, chainId }: { row: DisplayRow; chainId: number }) {
  return (
    <div className="flex min-w-0 flex-row items-center justify-end gap-1.5">
      <TokenIcon
        chainId={chainId}
        address={row.tokenAddress ?? ethAddress}
        symbol={row.symbol}
        className="size-4 flex-none"
      />
      <p className="text-foreground truncate font-mono text-[11px]">
        <span className="font-semibold">{formatGrouped(row.value)}</span>
        {row.symbol && <span className="text-muted-foreground"> {row.symbol}</span>}
      </p>
    </div>
  );
}

function AddressValue({
  row,
  resolvedName,
  avatarSrc,
}: {
  row: DisplayRow;
  resolvedName?: string;
  avatarSrc?: string;
}) {
  const addr = row.rawValue ?? row.value;
  return (
    <div className="flex min-w-0 flex-row items-center justify-end gap-1.5">
      <IdentityAvatar src={avatarSrc} fallback={null} />
      {/* Truncate — the raw column is right-aligned and must never wrap the row. */}
      <span className="text-foreground truncate font-mono text-[11px]">
        {resolvedName ? resolvedName : formatAddress(addr)}
      </span>
    </div>
  );
}

export const ClearSignedView = ({ display, chainId, mainnetRpcUrl }: ClearSignedViewProps) => {
  const [resolved, setResolved] = useState<Record<string, string>>({});
  const [avatars, setAvatars] = useState<Record<string, string>>({});
  const attemptedRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (!mainnetRpcUrl) return;
    const addresses = display.rows
      .filter((r) => r.kind === 'address' && r.rawValue)
      .map((r) => (r.rawValue as string).toLowerCase());
    const unique = [...new Set(addresses)].filter((a) => !attemptedRef.current.has(a));
    if (unique.length === 0) return;

    unique.forEach((a) => attemptedRef.current.add(a));

    let cancelled = false;
    reverseResolveWithAvatars(
      unique.map((address) => ({ address, chainId })),
      mainnetRpcUrl
    )
      .then(async (resolved) => {
        if (cancelled) return;
        const label = await getChainLabel(chainId, mainnetRpcUrl);
        if (cancelled) return;
        const nextResolved: Record<string, string> = {};
        const nextAvatars: Record<string, string> = {};
        for (const address of unique) {
          const identity = resolved[address];
          if (!identity) continue;
          nextResolved[address] = label ? `${identity.name}@${label}` : identity.name;
          if (identity.avatar) nextAvatars[address] = identity.avatar;
        }
        setResolved((prev) => {
          const next = { ...prev };
          let changed = false;
          for (const [address, value] of Object.entries(nextResolved)) {
            if (next[address] !== value) {
              next[address] = value;
              changed = true;
            }
          }
          return changed ? next : prev;
        });
        if (Object.keys(nextAvatars).length > 0) {
          setAvatars((prev) => ({ ...prev, ...nextAvatars }));
        }
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [display, mainnetRpcUrl, chainId]);

  const hasHeader = !!display.intent;
  const hasRows = display.rows.length > 0;
  if (!hasHeader && !hasRows) return null;

  return (
    <div className="border-border rounded-[10.5px] border p-3">
      {hasHeader && (
        <div className={`text-foreground text-[12px] font-semibold ${hasRows ? 'mb-2.5' : ''}`}>{display.intent}</div>
      )}
      {hasRows && (
        <div className="divide-border/40 flex flex-col divide-y">
          {display.rows.map((row, i) => {
            const lookup = row.rawValue?.toLowerCase();
            const resolvedName = lookup ? resolved[lookup] : undefined;
            const avatarSrc = lookup ? avatars[lookup] : undefined;
            return (
              // Row-wise: label left, value right — one line each, value truncates.
              <div key={i} className="flex items-baseline justify-between gap-3 py-[7px] first:pt-0 last:pb-0">
                <span className="text-muted-foreground flex-none text-[11px] font-medium">{row.label}</span>
                <div className="min-w-0 text-right">
                  {row.kind === 'tokenAmount' || row.kind === 'amount' ? (
                    <TokenAmountValue row={row} chainId={chainId} />
                  ) : row.kind === 'address' ? (
                    <AddressValue row={row} resolvedName={resolvedName} avatarSrc={avatarSrc} />
                  ) : (
                    <span className="text-foreground break-all font-mono text-[11px]">{row.value}</span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
