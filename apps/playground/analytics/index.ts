import posthog from 'posthog-js';
import { EVENTS, type EventPayload } from './events';

// Build-time kill-switch. Kept `false` locally so dev traffic never pollutes the
// production PostHog project; set to `true` only in the deployed environment.
const analyticsEnabled = process.env.NEXT_PUBLIC_ANALYTICS_ENABLED === 'true';

let analyticsInstance: Analytics | null = null;

/**
 * Lazy singleton. The first call constructs the client (and, when enabled,
 * initializes posthog-js). Every subsequent call returns the same instance.
 */
export const getAnalyticsClient = (): Analytics => {
  if (!analyticsInstance) {
    analyticsInstance = new Analytics();
  }
  return analyticsInstance;
};

class Analytics {
  constructor() {
    if (typeof window !== 'undefined' && analyticsEnabled) {
      const key = process.env.NEXT_PUBLIC_POSTHOG_KEY;
      const host = process.env.NEXT_PUBLIC_POSTHOG_HOST;
      if (!key) {
        throw new Error('Analytics key is required');
      }
      posthog.init(key, {
        api_host: host,
        // With a reverse-proxy api_host, posthog-js can't infer the real app
        // URL, so toolbar / session-replay / "view in PostHog" links break
        // without this.
        ui_host: 'https://eu.posthog.com',
        // Pageviews are tracked manually by AnalyticsProvider on every
        // App-Router navigation (the default only fires on hard loads).
        capture_pageview: false,
        capture_pageleave: true,
        autocapture: true,
        // Only spawn person profiles once we identify() a connected wallet;
        // anonymous demo traffic is still captured but doesn't create empty
        // profiles.
        person_profiles: 'identified_only',
        loaded: (ph) => {
          if (process.env.NODE_ENV === 'development') ph.debug();
        },
      });
      // Super properties: attached to EVERY event so the source app and
      // environment are always sliceable in PostHog.
      posthog.register({
        app: 'playground',
        environment: process.env.NODE_ENV,
      });
    }
  }

  identify(id: string) {
    if (!analyticsEnabled) return;
    posthog.identify(id);
    this.register({ id });
  }

  register(props: Record<string, string>) {
    if (!analyticsEnabled) return;
    posthog.register(props);
  }

  track<T extends keyof typeof EVENTS>(event: T, props: EventPayload[(typeof EVENTS)[T]]) {
    if (!analyticsEnabled) return;
    posthog.capture(EVENTS[event], props);
  }

  track_unsafe(event: string, props: Record<string, unknown>) {
    if (!analyticsEnabled) return;
    posthog.capture(event, props);
  }

  people_set(props: Record<string, string | number | boolean | string[]>) {
    if (!analyticsEnabled) return;
    posthog.setPersonProperties(props);
  }

  reset() {
    if (!analyticsEnabled) return;
    posthog.reset();
  }
}

export default Analytics;
