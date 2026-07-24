import { useEffect, useRef, useState } from 'react';
import { ethAddress } from 'viem';
import type { ClearSigningDisplay, DisplayRow } from '../../utils/clearSigning';
import { reverseResolveWithAvatars, formatAddress, getChainLabel } from '../../utils';
import { dateTone, formatUnixDate, groupNumber, isUnlimitedAmount } from '../../utils/displayFormat';
import { TriangleAlert } from 'lucide-react';
import { IdentityAvatar } from '../IdentityAvatar';
import { TokenIcon } from '../TokenIcon';
import { CopyIcon, CopiedIcon } from '../../icons';

/** Small copy-to-clipboard button that copies the full address. */
function CopyAddress({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);
  const onCopy = () => {
    if (typeof navigator === 'undefined' || !navigator.clipboard) return;
    navigator.clipboard
      .writeText(value)
      .then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      })
      .catch(() => undefined);
  };
  return copied ? (
    <CopiedIcon className="size-3 flex-none" />
  ) : (
    <CopyIcon className="text-muted-foreground size-3 flex-none cursor-pointer" onClick={onCopy} />
  );
}

interface ClearSignedViewProps {
  display: ClearSigningDisplay;
  chainId: number;
  mainnetRpcUrl?: string;
}

function TokenAmountValue({ row, chainId }: { row: DisplayRow; chainId: number }) {
  // Max-uint approvals read as "Unlimited" (matching the raw tree) rather than a
  // 78-digit number, and carry a warning tone (amber + triangle) — an unbounded
  // allowance is exactly what a user must notice. Full amounts wrap, never truncate.
  const unlimited = isUnlimitedAmount(row.rawValue);
  return (
    <div className="flex min-w-0 flex-row items-center justify-end gap-1.5">
      {unlimited ? (
        <TriangleAlert className="size-3.5 flex-none text-amber-500" strokeWidth={2} />
      ) : (
        <TokenIcon
          chainId={chainId}
          address={row.tokenAddress ?? ethAddress}
          symbol={row.symbol}
          className="size-4 flex-none"
        />
      )}
      <p className={`break-all font-mono text-[11px] ${unlimited ? 'text-amber-500' : 'text-foreground'}`}>
        <span className="font-semibold">{unlimited ? 'Unlimited' : groupNumber(row.value)}</span>
        {row.symbol && <span className={unlimited ? '' : 'text-muted-foreground'}> {row.symbol}</span>}
      </p>
    </div>
  );
}

/** Deadline/expiry value: "1 Jan 2030", tinted + flagged when expired (past) or far-future. */
function DateValue({ raw }: { raw: string }) {
  const tone = dateTone(raw);
  const toneClass = tone === 'expired' ? 'text-destructive' : tone === 'far' ? 'text-amber-500' : 'text-foreground';
  return (
    <span className={`break-all font-mono text-[11px] ${toneClass}`}>
      {formatUnixDate(raw)}
      {tone === 'expired' && <span className="font-semibold"> · Expired</span>}
    </span>
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
      <CopyAddress value={addr} />
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
                  ) : row.kind === 'date' && row.rawValue ? (
                    <DateValue raw={row.rawValue} />
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
