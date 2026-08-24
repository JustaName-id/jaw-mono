'use client';

import { useEffect } from 'react';
import { usePathname, useSearchParams } from 'next/navigation';
import { getAnalyticsClient } from '@/lib/analytics';
import type { CtaSurface } from '@/lib/analytics/events/types';

/**
 * Outbound host → event name. Same destination-named convention as landing,
 * docs and playground, so one funnel spans every JAW property.
 */
const OUTBOUND: Record<string, 'PLAYGROUND_CLICKED' | 'DOCS_CLICKED' | 'GET_STARTED_CLICKED' | 'WEBSITE_CLICKED'> = {
  'playground.jaw.id': 'PLAYGROUND_CLICKED',
  'docs.jaw.id': 'DOCS_CLICKED',
  'dashboard.jaw.id': 'GET_STARTED_CLICKED',
  'jaw.id': 'WEBSITE_CLICKED',
  'www.jaw.id': 'WEBSITE_CLICKED',
};

/**
 * Tracks a `$pageview` on every App-Router navigation (posthog-js' built-in
 * pageview only fires on hard loads), and every outbound CTA click.
 *
 * Outbound clicks are delegated from the document rather than wired per link:
 * the demo scatters the same four destinations across the header, mobile intro,
 * in-phone menu, feature list and finale sheet, and a link added later should
 * be covered without another edit. `location` comes from the nearest
 * `data-analytics-surface` ancestor, so a dashboard click from the finale sheet
 * is distinguishable from one in the header.
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

  useEffect(() => {
    // Capture phase, so the event is recorded before the navigation starts.
    const onClick = (e: MouseEvent) => {
      const target = e.target as Element | null;
      const anchor = target?.closest?.('a[href]') as HTMLAnchorElement | null;
      if (!anchor) return;
      let host: string;
      try {
        host = new URL(anchor.href, window.location.href).host;
      } catch {
        return;
      }
      const event = OUTBOUND[host];
      if (!event) return;
      const surface = (anchor.closest('[data-analytics-surface]') as HTMLElement | null)?.dataset.analyticsSurface as
        | CtaSurface
        | undefined;
      getAnalyticsClient().track(event, { location: surface ?? 'page' });
    };
    document.addEventListener('click', onClick, true);
    return () => document.removeEventListener('click', onClick, true);
  }, []);

  return <>{children}</>;
}
