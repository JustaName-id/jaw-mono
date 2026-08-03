'use client';

import { Globe } from 'lucide-react';
import { IdentityAvatar } from '../IdentityAvatar';
import { isSafeImageUrl } from '../../utils/safeUrl';
import { sanitizeDisplayName } from '../../utils/sanitize';

/** The requesting dApp's display name, sanitized, falling back to "dApp". */
export function safeAppName(appName?: string | null): string {
  return sanitizeDisplayName(appName ?? '') || 'dApp';
}

/**
 * The requesting dApp's logo, falling back to a neutral globe when it's absent, fails
 * `isSafeImageUrl`, or fails to load. One home for that policy so every dialog applies it
 * identically — and, via `IdentityAvatar`, so the dApp-controlled URL can't leak the wallet
 * page URL (which carries the api-key) as a referrer.
 */
export function AppAvatar({
  appName,
  appLogoUrl,
  className = 'h-full w-full rounded-full',
}: {
  appName?: string;
  appLogoUrl?: string | null;
  className?: string;
}) {
  return (
    <IdentityAvatar
      src={isSafeImageUrl(appLogoUrl) ? (appLogoUrl ?? undefined) : undefined}
      alt={`${safeAppName(appName)} logo`}
      className={className}
      fallback={<Globe className="text-muted-foreground m-auto h-1/2 w-1/2" strokeWidth={1.5} />}
    />
  );
}
