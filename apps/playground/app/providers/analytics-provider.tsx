'use client';

import { useEffect } from 'react';
import { usePathname, useSearchParams } from 'next/navigation';
import { getAnalyticsClient } from '../../analytics';

/**
 * Tracks a `$pageview` on every App-Router navigation. posthog-js' built-in
 * pageview only fires on hard loads, so client-side route changes need this.
 *
 * Uses `useSearchParams`, which forces a Suspense boundary in Next 15 — the
 * caller wraps this provider in <Suspense>.
 */
export function AnalyticsProvider({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const searchParams = useSearchParams();

  useEffect(() => {
    if (typeof window !== 'undefined' && pathname) {
      let url = window.location.origin + pathname;
      const query = searchParams.toString();
      if (query) {
        url += `?${query}`;
      }
      getAnalyticsClient().track_unsafe('$pageview', {
        $current_url: url,
      });
    }
  }, [pathname, searchParams]);

  return <>{children}</>;
}
