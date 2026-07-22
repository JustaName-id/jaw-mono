import { JSX } from 'react';
import { Globe } from 'lucide-react';

import { sanitizeDisplayName } from '../../utils/sanitize';
import { isSafeImageUrl } from '../../utils/safeUrl';

export interface DialogAppHeaderProps {
  /** dApp name (externally-controlled metadata — sanitized before display). */
  appName?: string;
  /** dApp logo URL (validated https/data image; falls back to a globe glyph). */
  appLogoUrl?: string | null;
  /** dApp origin, shown truncated to the hostname. */
  origin: string;
  chainName?: string;
  chainIcon?: JSX.Element;
}

/** dApp origin → bare hostname for display. */
export function formatOrigin(origin: string): string {
  try {
    const url = new URL(origin.startsWith('http') ? origin : `https://${origin}`);
    return url.hostname.replace('www.', '');
  } catch {
    return origin;
  }
}

/**
 * "Who's asking" header shared by the wallet dialogs: dApp logo (with a themed
 * border + chain badge), app name, and origin. Theme-adaptive via semantic tokens.
 */
export function DialogAppHeader({ appName, appLogoUrl, origin, chainName, chainIcon }: DialogAppHeaderProps) {
  const safeAppName = sanitizeDisplayName(appName ?? '') || 'dApp';

  const appAvatar = isSafeImageUrl(appLogoUrl) ? (
    <img
      src={appLogoUrl ?? undefined}
      alt={`${safeAppName} logo`}
      className="h-full w-full rounded-full object-cover"
    />
  ) : (
    <Globe className="text-muted-foreground m-auto h-1/2 w-1/2" strokeWidth={1.5} />
  );

  return (
    <div className="flex items-center gap-3">
      <span className="relative flex-none">
        <span className="bg-secondary border-border flex h-12 w-12 items-center justify-center overflow-hidden rounded-full border">
          {appAvatar}
        </span>
        {chainIcon && (
          <span
            title={chainName}
            // Ring drawn with the card color so the badge reads as sitting on the
            // surface. The chain icon arrives pre-sized (inline 24px), so force it
            // down to the badge size or it renders cropped.
            className="border-popover bg-popover absolute -bottom-0.5 -right-0.5 flex h-4 w-4 items-center justify-center overflow-hidden rounded-full border-2 [&>*]:!h-full [&>*]:!w-full [&>*]:!min-w-0"
          >
            {chainIcon}
          </span>
        )}
      </span>
      <span className="flex min-w-0 flex-col gap-0.5">
        <span className="text-foreground truncate text-[17px] font-semibold tracking-[-0.02em]">{safeAppName}</span>
        <span className="text-muted-foreground truncate font-mono text-[10px]">{formatOrigin(origin)}</span>
      </span>
    </div>
  );
}
