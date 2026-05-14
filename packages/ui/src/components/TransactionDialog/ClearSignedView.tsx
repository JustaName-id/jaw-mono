import { useEffect, useRef, useState } from 'react';
import type { ClearSigningDisplay, DisplayRow } from '../../utils/clearSigning';
import { getJustaNameInstance, formatAddress, getChainLabel } from '../../utils';

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

function TokenAmountValue({ row }: { row: DisplayRow }) {
  return (
    <p className="text-foreground break-all font-mono text-xs leading-[150%]">
      <span className="font-semibold">{formatGrouped(row.value)}</span>
      {row.symbol && <span className="text-muted-foreground"> {row.symbol}</span>}
    </p>
  );
}

function AddressValue({ row, resolvedName }: { row: DisplayRow; resolvedName?: string }) {
  const addr = row.rawValue ?? row.value;
  return (
    <p className="text-foreground break-all font-mono text-xs leading-[150%]">
      {resolvedName ? `${resolvedName} (${formatAddress(addr)})` : addr}
    </p>
  );
}

export const ClearSignedView = ({ display, chainId, mainnetRpcUrl }: ClearSignedViewProps) => {
  const [resolved, setResolved] = useState<Record<string, string>>({});
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
    const justaName = getJustaNameInstance(mainnetRpcUrl);
    unique.forEach((address) => {
      justaName.subnames
        .reverseResolve({ address: address as `0x${string}`, chainId })
        .then(async (result) => {
          if (cancelled || !result) return;
          const label = await getChainLabel(chainId, mainnetRpcUrl);
          const next = label ? `${result}@${label}` : result;
          setResolved((prev) => (prev[address] === next ? prev : { ...prev, [address]: next }));
        })
        .catch(() => {
          /* silent */
        });
    });
    return () => {
      cancelled = true;
    };
  }, [display, mainnetRpcUrl, chainId]);

  const hasHeader = !!display.intent;
  const hasRows = display.rows.length > 0;
  if (!hasHeader && !hasRows) return null;

  return (
    <div className="bg-secondary flex flex-col rounded-[6px]">
      {hasHeader && (
        <div className={`flex items-center gap-2 px-2 pt-2 ${hasRows ? 'pb-1.5' : 'pb-2'}`}>
          <span className="text-foreground text-xs font-semibold capitalize">{display.intent}</span>
        </div>
      )}
      {hasRows && (
        <div className={`flex flex-col gap-1 px-2 pb-2 ${hasHeader ? 'border-border/40 border-t pt-2' : 'pt-2'}`}>
          {display.rows.map((row, i) => {
            const lookup = row.rawValue?.toLowerCase();
            const resolvedName = lookup ? resolved[lookup] : undefined;
            return (
              <div key={i} className="flex flex-col gap-0.5">
                <span className="text-muted-foreground text-xs font-semibold">{row.label}</span>
                {row.kind === 'tokenAmount' || row.kind === 'amount' ? (
                  <TokenAmountValue row={row} />
                ) : row.kind === 'address' ? (
                  <AddressValue row={row} resolvedName={resolvedName} />
                ) : (
                  <p className="text-foreground break-all font-mono text-xs leading-[150%]">{row.value}</p>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
