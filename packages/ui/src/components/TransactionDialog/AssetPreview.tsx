import { useEffect, useState } from 'react';
import { ethAddress } from 'viem';
import { ArrowDownLeft, ArrowUpRight, Info } from 'lucide-react';
import { AssetDelta, formatAssetAmount } from '../../utils/assetPreview';
import { fetchTokenPrice } from '../../utils/tokenPrice';
import { formatAddress } from '../../utils/formatAddress';
import { CopiedIcon, CopyIcon } from '../../icons';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '../ui/tooltip';
import { TokenIcon } from '../TokenIcon';

interface AssetPreviewProps {
  assetsOut: AssetDelta[];
  assetsIn: AssetDelta[];
  error: boolean;
  willRevert: boolean;
  nativeSymbol: string;
  /** Enables token icon lookups; rows fall back to the generic icon when absent. */
  chainId?: number;
}

function symbolFor(delta: AssetDelta, nativeSymbol: string): string {
  return delta.isNative ? nativeSymbol : (delta.symbol ?? '');
}

function formatUsd(value: number): string {
  if (value < 0.01) return '<$0.01';
  return `$${value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function SectionHeader({ direction }: { direction: 'out' | 'in' }) {
  const out = direction === 'out';
  const colorClass = out ? 'text-red-500' : 'text-green-500';
  const Arrow = out ? ArrowUpRight : ArrowDownLeft;
  return (
    <div className="flex flex-row items-center gap-1.5">
      <span
        className={`flex size-4 items-center justify-center rounded-full ${out ? 'bg-red-500/15' : 'bg-green-500/15'}`}
      >
        <Arrow className={`size-2.5 ${colorClass}`} />
      </span>
      <span className={`text-xs font-bold leading-[133%] ${colorClass}`}>{out ? 'SEND' : 'RECEIVE'}</span>
    </div>
  );
}

function AssetRow({
  delta,
  nativeSymbol,
  chainId,
  price,
  copied,
  onCopy,
}: {
  delta: AssetDelta;
  nativeSymbol: string;
  chainId?: number;
  price?: number;
  copied: boolean;
  onCopy: () => void;
}) {
  const out = delta.direction === 'out';
  const sign = out ? '-' : '+';
  const colorClass = out ? 'text-red-500' : 'text-green-500';
  const symbol = symbolFor(delta, nativeSymbol);
  const rounded = formatAssetAmount(delta.amountFormatted);
  const hasMore = rounded !== delta.amountFormatted;
  const usd = price && price > 0 ? Number(delta.amountFormatted) * price : 0;

  const amount = (
    <span className={`break-all text-right text-base font-medium leading-[150%] ${colorClass}`}>
      {sign}
      {rounded}
    </span>
  );

  return (
    <div className="flex flex-row items-center justify-between gap-3">
      <div className="flex min-w-0 flex-row items-center gap-2">
        <TokenIcon
          chainId={chainId}
          address={delta.isNative ? ethAddress : delta.address}
          symbol={symbol}
          className="size-8"
        />
        <div className="flex min-w-0 flex-col">
          <span className="text-foreground text-sm font-semibold leading-[150%]">{symbol}</span>
          {!delta.isNative && (
            <span className="text-muted-foreground flex flex-row items-center gap-1 text-xs leading-[133%]">
              {formatAddress(delta.address)}
              {copied ? (
                <CopiedIcon width={12} height={12} className="flex-shrink-0" />
              ) : (
                <CopyIcon width={12} height={12} className="flex-shrink-0 cursor-pointer" onClick={onCopy} />
              )}
            </span>
          )}
        </div>
      </div>
      <div className="flex min-w-0 flex-col items-end">
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
        {usd > 0 && <span className="text-muted-foreground text-xs leading-[133%]">{formatUsd(usd)}</span>}
      </div>
    </div>
  );
}

export const AssetPreview = ({ assetsOut, assetsIn, error, willRevert, nativeSymbol, chainId }: AssetPreviewProps) => {
  const [prices, setPrices] = useState<Record<string, number>>({});
  const [copiedAddress, setCopiedAddress] = useState<string>();

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

  const copy = (address: string) => {
    if (typeof window === 'undefined' || !navigator?.clipboard) return;
    navigator.clipboard.writeText(address).catch(() => undefined);
    setCopiedAddress(address);
    setTimeout(() => setCopiedAddress(undefined), 3000);
  };

  if (willRevert) {
    return (
      <div className="flex items-center gap-1 px-3.5">
        <p className="text-xs leading-[133%] text-red-500">Transaction is likely to fail</p>
        <TooltipProvider delayDuration={0}>
          <Tooltip>
            <TooltipTrigger asChild>
              <Info className="size-3 cursor-help text-red-500" />
            </TooltipTrigger>
            <TooltipContent side="top" className="max-w-[240px] text-xs">
              <p>
                Simulation shows this transaction reverting on-chain. You can still submit it, but it will probably fail
                and consume gas.
              </p>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      </div>
    );
  }

  if (error || (assetsOut.length === 0 && assetsIn.length === 0)) return null;

  return (
    <div className="border-border flex flex-col gap-3 rounded-[6px] border p-3.5">
      {assetsOut.length > 0 && (
        <div className="flex flex-col gap-2">
          <SectionHeader direction="out" />
          {assetsOut.map((d) => (
            <AssetRow
              key={`out-${d.address}`}
              delta={d}
              nativeSymbol={nativeSymbol}
              chainId={chainId}
              price={prices[symbolFor(d, nativeSymbol)]}
              copied={copiedAddress === d.address}
              onCopy={() => copy(d.address)}
            />
          ))}
        </div>
      )}
      {assetsIn.length > 0 && (
        <div className="flex flex-col gap-2">
          <SectionHeader direction="in" />
          {assetsIn.map((d) => (
            <AssetRow
              key={`in-${d.address}`}
              delta={d}
              nativeSymbol={nativeSymbol}
              chainId={chainId}
              price={prices[symbolFor(d, nativeSymbol)]}
              copied={copiedAddress === d.address}
              onCopy={() => copy(d.address)}
            />
          ))}
        </div>
      )}
    </div>
  );
};
