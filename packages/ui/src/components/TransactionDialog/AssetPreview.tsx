import { AssetDelta } from '../../utils/assetPreview';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '../ui/tooltip';

interface AssetPreviewProps {
  assetsOut: AssetDelta[];
  assetsIn: AssetDelta[];
  error: boolean;
  nativeSymbol: string;
}

function symbolFor(delta: AssetDelta, nativeSymbol: string): string {
  return delta.isNative ? nativeSymbol : (delta.symbol ?? '');
}

// Display rounding: at most 4 decimals (drops trailing zeros). Full value shown on hover.
function displayAmount(amountFormatted: string): string {
  const n = Number(amountFormatted);
  if (n > 0 && n < 0.0001) return '<0.0001';
  return String(Number(n.toFixed(4)));
}

function AmountRow({
  delta,
  label,
  colorClass,
  nativeSymbol,
}: {
  delta: AssetDelta;
  label: string;
  colorClass: string;
  nativeSymbol: string;
}) {
  const sign = delta.direction === 'out' ? '-' : '+';
  const symbol = symbolFor(delta, nativeSymbol);
  const rounded = displayAmount(delta.amountFormatted);
  // Only show a hover tooltip when rounding actually hid precision.
  const hasMore = rounded !== delta.amountFormatted;

  const amount = (
    <span className={`flex-1 break-all text-right text-lg font-medium leading-[150%] ${colorClass}`}>
      {sign}
      {rounded} {symbol}
    </span>
  );

  return (
    <div className="flex flex-row items-start justify-between gap-3">
      <span className="text-muted-foreground flex-shrink-0 text-sm leading-[150%]">{label}</span>
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
    </div>
  );
}

export const AssetPreview = ({ assetsOut, assetsIn, error, nativeSymbol }: AssetPreviewProps) => {
  // Render nothing while simulating or on error — the section appears only once there are changes.
  if (error || (assetsOut.length === 0 && assetsIn.length === 0)) return null;

  return (
    <div className="border-border flex flex-col gap-3 rounded-[6px] border p-3.5">
      <p className="text-foreground text-xs font-bold leading-[133%]">Asset change</p>
      <div className="flex flex-col gap-2">
        {assetsOut.map((d) => (
          <AmountRow
            key={`out-${d.address}`}
            delta={d}
            label="You send"
            colorClass="text-red-500"
            nativeSymbol={nativeSymbol}
          />
        ))}
        {assetsIn.map((d) => (
          <AmountRow
            key={`in-${d.address}`}
            delta={d}
            label="You receive"
            colorClass="text-green-500"
            nativeSymbol={nativeSymbol}
          />
        ))}
      </div>
    </div>
  );
};
