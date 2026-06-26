import { AssetDelta } from '../../utils/assetPreview';

interface AssetPreviewProps {
  assetsOut: AssetDelta[];
  assetsIn: AssetDelta[];
  error: boolean;
  nativeSymbol: string;
}

function symbolFor(delta: AssetDelta, nativeSymbol: string): string {
  return delta.isNative ? nativeSymbol : (delta.symbol ?? '');
}

export const AssetPreview = ({ assetsOut, assetsIn, error, nativeSymbol }: AssetPreviewProps) => {
  // Render nothing while simulating or on error — the section appears only once there are changes.
  if (error || (assetsOut.length === 0 && assetsIn.length === 0)) return null;

  return (
    <div className="border-border flex flex-col gap-3 rounded-[6px] border p-3.5">
      <p className="text-foreground text-xs font-bold leading-[133%]">Estimated changes</p>
      {assetsOut.length > 0 && (
        <div className="flex flex-col gap-1">
          <p className="text-muted-foreground text-xs font-normal leading-[133%]">You send</p>
          {assetsOut.map((d) => (
            <p key={`out-${d.address}`} className="text-base font-normal leading-[150%] text-red-500">
              -{d.amountFormatted} {symbolFor(d, nativeSymbol)}
            </p>
          ))}
        </div>
      )}
      {assetsIn.length > 0 && (
        <div className="flex flex-col gap-1">
          <p className="text-muted-foreground text-xs font-normal leading-[133%]">You receive</p>
          {assetsIn.map((d) => (
            <p key={`in-${d.address}`} className="text-base font-normal leading-[150%] text-green-500">
              +{d.amountFormatted} {symbolFor(d, nativeSymbol)}
            </p>
          ))}
        </div>
      )}
    </div>
  );
};
