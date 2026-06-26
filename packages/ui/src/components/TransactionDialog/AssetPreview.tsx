import { AssetDelta } from '../../utils/assetPreview';

interface AssetPreviewProps {
  assetsOut: AssetDelta[];
  assetsIn: AssetDelta[];
  loading: boolean;
  error: boolean;
  nativeSymbol: string;
}

function symbolFor(delta: AssetDelta, nativeSymbol: string): string {
  return delta.isNative ? nativeSymbol : (delta.symbol ?? '');
}

export const AssetPreview = ({ assetsOut, assetsIn, loading, error, nativeSymbol }: AssetPreviewProps) => {
  if (error) return null;

  if (loading) {
    return (
      <div className="border-border flex flex-col gap-2.5 rounded-[6px] border p-3.5">
        <p className="text-foreground text-xs font-bold leading-[133%]">Estimated changes</p>
        <p className="text-muted-foreground text-base font-normal leading-[150%]">Simulating...</p>
      </div>
    );
  }

  if (assetsOut.length === 0 && assetsIn.length === 0) return null;

  return (
    <div className="border-border flex flex-col gap-3 rounded-[6px] border p-3.5">
      <p className="text-foreground text-xs font-bold leading-[133%]">Estimated changes</p>
      {assetsOut.length > 0 && (
        <div className="flex flex-col gap-1">
          <p className="text-muted-foreground text-xs font-normal leading-[133%]">You send</p>
          {assetsOut.map((d) => (
            <p key={`out-${d.address}`} className="text-destructive text-base font-normal leading-[150%]">
              -{d.amountFormatted} {symbolFor(d, nativeSymbol)}
            </p>
          ))}
        </div>
      )}
      {assetsIn.length > 0 && (
        <div className="flex flex-col gap-1">
          <p className="text-muted-foreground text-xs font-normal leading-[133%]">You receive</p>
          {assetsIn.map((d) => (
            <p key={`in-${d.address}`} className="text-success text-base font-normal leading-[150%]">
              +{d.amountFormatted} {symbolFor(d, nativeSymbol)}
            </p>
          ))}
        </div>
      )}
    </div>
  );
};
