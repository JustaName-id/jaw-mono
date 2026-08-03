'use client';

import { Globe } from 'lucide-react';
import { isSafeImageUrl } from '../../utils/safeUrl';
import { sanitizeDisplayName } from '../../utils/sanitize';

/** The requesting dApp's display name, sanitized, falling back to "dApp". */
export function safeAppName(appName?: string | null): string {
  return sanitizeDisplayName(appName ?? '') || 'dApp';
}

/**
 * The requesting dApp's logo, falling back to a neutral globe. Untrusted URLs are filtered by
 * `isSafeImageUrl`, so every dialog gets the same policy rather than its own copy of it.
 */
export function AppAvatar({ appName, appLogoUrl }: { appName?: string; appLogoUrl?: string | null }) {
  if (!isSafeImageUrl(appLogoUrl)) {
    return <Globe className="text-muted-foreground m-auto h-1/2 w-1/2" strokeWidth={1.5} />;
  }
  return (
    <img
      src={appLogoUrl ?? undefined}
      alt={`${safeAppName(appName)} logo`}
      className="h-full w-full rounded-full object-cover"
    />
  );
}
