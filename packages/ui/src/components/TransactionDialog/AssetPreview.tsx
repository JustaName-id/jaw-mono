import { useEffect, useState } from 'react';
import { ethAddress } from 'viem';
import { ArrowDownLeft, ArrowUpRight, ChevronDown } from 'lucide-react';
import { AssetDelta, formatAssetAmount } from '../../utils/assetPreview';
import { fetchTokenPrice } from '../../utils/tokenPrice';
import { formatAddress } from '../../utils/formatAddress';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '../ui/tooltip';
import { TokenIcon } from '../TokenIcon';
import { CopyButton } from '../CopyButton';
import { SubText } from '../SubText';

interface AssetPreviewProps {
  assetsOut: AssetDelta[];
  assetsIn: AssetDelta[];
  error: boolean;
  nativeSymbol: string;
  /** Enables token icon lookups; rows fall back to the generic icon when absent. */
  chainId?: number;
}

/** Rows shown before the "+N" overflow toggle kicks in. */
const COLLAPSED_ROWS = 2;

function symbolFor(delta: AssetDelta, nativeSymbol: string): string {
  return delta.isNative ? nativeSymbol : (delta.symbol ?? '');
}

function formatUsd(value: number): string {
  if (value < 0.01) return '<$0.01';
  return `$${value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function AssetRow({
  delta,
  nativeSymbol,
  chainId,
  price,
}: {
  delta: AssetDelta;
  nativeSymbol: string;
  chainId?: number;
  price?: number;
}) {
  const out = delta.direction === 'out';
  const sign = out ? '−' : '+';
  const colorClass = out ? 'text-red-400' : 'text-green-400';
  const symbol = symbolFor(delta, nativeSymbol);
  const rounded = formatAssetAmount(delta.amountFormatted);
  const hasMore = rounded !== delta.amountFormatted;
  const usd = price && price > 0 ? Number(delta.amountFormatted) * price : 0;

  const amount = (
    <span className={`break-all text-right font-mono text-[12px] font-medium ${colorClass}`}>
      {sign}
      <SubText>{rounded}</SubText>
    </span>
  );

  return (
    // A fixed row height keeps the two columns' rows on the same baseline: an ERC-20 row carries
    // an address sub-line and a native row doesn't, so without it they drift apart when expanded.
    <div className="flex min-h-[34px] flex-row items-center gap-1.5">
      <TokenIcon
        chainId={chainId}
        address={delta.isNative ? ethAddress : delta.address}
        symbol={symbol}
        className="size-[21px] flex-none"
      />
      <div className="flex min-w-0 flex-1 flex-col">
        <span className="text-foreground truncate text-[12px] font-medium">{symbol}</span>
        {!delta.isNative && (
          <span className="text-muted-foreground flex min-w-0 flex-row items-center gap-1 font-mono text-[10px]">
            <span className="truncate">{formatAddress(delta.address)}</span>
            <CopyButton value={delta.address} size={10} label="Copy token address" />
          </span>
        )}
      </div>
      <div className="flex flex-none flex-col items-end">
        {hasMore ? (
          <TooltipProvider delayDuration={0}>
            <Tooltip>
              <TooltipTrigger asChild>{amount}</TooltipTrigger>
              <TooltipContent side="top" className="max-w-[240px] break-all text-xs">
                {sign}
                {delta.amountFormatted} {symbol}
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        ) : (
          amount
        )}
        {usd > 0 && <span className="text-muted-foreground text-[10px]">{formatUsd(usd)}</span>}
      </div>
    </div>
  );
}

/**
 * One direction of the simulated balance change — "You send" or "You get" — as its own
 * bordered card with a header strip. Beyond `COLLAPSED_ROWS` entries the tail collapses
 * behind a "+N" toggle so a many-legged swap stays the same height as a simple one.
 */
function DeltaColumn({
  direction,
  deltas,
  nativeSymbol,
  chainId,
  prices,
}: {
  direction: 'out' | 'in';
  deltas: AssetDelta[];
  nativeSymbol: string;
  chainId?: number;
  prices: Record<string, number>;
}) {
  const [expanded, setExpanded] = useState(false);
  const out = direction === 'out';
  const Arrow = out ? ArrowUpRight : ArrowDownLeft;
  const overflow = deltas.length - COLLAPSED_ROWS;
  const shown = expanded ? deltas : deltas.slice(0, COLLAPSED_ROWS);

  return (
    <div className="border-border min-w-0 flex-1 overflow-hidden rounded-[10.5px] border">
      <div className="border-border bg-secondary/40 flex items-center gap-1.5 border-b px-3 py-2">
        <Arrow className={`size-3 flex-none ${out ? 'text-red-400' : 'text-green-400'}`} strokeWidth={2.7} />
        <span className="text-foreground text-[13px] font-semibold tracking-[-0.02em]">
          {out ? 'You send' : 'You get'}
        </span>
        {overflow > 0 && (
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            className="text-muted-foreground hover:text-foreground ml-auto flex flex-none items-center gap-0.5 font-mono text-[10px] font-medium"
          >
            {expanded ? 'Show less' : `+${overflow}`}
            <ChevronDown className={`size-3 transition-transform ${expanded ? 'rotate-180' : ''}`} strokeWidth={2.2} />
          </button>
        )}
      </div>
      <div className="flex flex-col gap-3 px-2 py-3">
        {shown.map((d) => (
          <AssetRow
            key={`${direction}-${d.address}`}
            delta={d}
            nativeSymbol={nativeSymbol}
            chainId={chainId}
            price={prices[symbolFor(d, nativeSymbol)]}
          />
        ))}
      </div>
    </div>
  );
}

export const AssetPreview = ({ assetsOut, assetsIn, error, nativeSymbol, chainId }: AssetPreviewProps) => {
  const [prices, setPrices] = useState<Record<string, number>>({});

  useEffect(() => {
    const symbols = [...new Set([...assetsOut, ...assetsIn].map((d) => symbolFor(d, nativeSymbol)).filter(Boolean))];
    if (symbols.length === 0) return;
    let cancelled = false;
    Promise.all(symbols.map(async (s) => [s, await fetchTokenPrice(s)] as const)).then((entries) => {
      if (!cancelled) setPrices(Object.fromEntries(entries));
    });
    return () => {
      cancelled = true;
    };
  }, [assetsOut, assetsIn, nativeSymbol]);

  if (error || (assetsOut.length === 0 && assetsIn.length === 0)) return null;

  const columnProps = { nativeSymbol, chainId, prices };

  // Both directions sit side by side (the swap/supply shape); a one-sided change takes
  // the full width rather than leaving a gap.
  return (
    <div className="flex items-stretch gap-2.5">
      {assetsOut.length > 0 && <DeltaColumn direction="out" deltas={assetsOut} {...columnProps} />}
      {assetsIn.length > 0 && <DeltaColumn direction="in" deltas={assetsIn} {...columnProps} />}
    </div>
  );
};
