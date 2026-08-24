import { composePlugins, withNx } from '@nx/next';
import type { WithNxOptions } from '@nx/next/plugins/with-nx';

const nextConfig: WithNxOptions = {
  nx: {},
  // @jaw.id/core ships workspace TS/ESM the app consumes directly.
  transpilePackages: ['@jaw.id/core'],
  // PostHog reverse proxy: makes analytics first-party (ad-blocker resistant).
  // Analytics is gated on NEXT_PUBLIC_ANALYTICS_ENABLED (set in Vercel Production env).
  // Ingestion lives on eu.i.posthog.com; the old eu.posthog.com host no longer
  // ingests /capture events. Static assets live on eu-assets.i.posthog.com.
  skipTrailingSlashRedirect: true,
  async rewrites() {
    return [
      {
        source: '/analytics/static/:path*',
        destination: 'https://eu-assets.i.posthog.com/static/:path*',
      },
      // Trailing-slash variant first: posthog-js hits /e/, /decide/, /s/.
      {
        source: '/analytics/:path*/',
        destination: 'https://eu.i.posthog.com/:path*/',
      },
      {
        source: '/analytics/:path*',
        destination: 'https://eu.i.posthog.com/:path*',
      },
    ];
  },
};

export default composePlugins(withNx)(nextConfig);
