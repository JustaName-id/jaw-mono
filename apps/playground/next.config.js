//@ts-check

const path = require('path');
const { composePlugins, withNx } = require('@nx/next');

/**
 * @type {import('@nx/next/plugins/with-nx').WithNxOptions}
 **/
const nextConfig = {
  nx: {},
  transpilePackages: ['@jaw.id/core', '@jaw.id/ui', '@jaw.id/wagmi'],
  experimental: {
    optimizePackageImports: ['lucide-react'],
  },
  // PostHog reverse proxy: makes analytics first-party (ad-blocker resistant).
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
  webpack: (config) => {
    config.resolve.alias = {
      ...config.resolve.alias,
      wagmi: path.dirname(require.resolve('wagmi/package.json')),
      '@wagmi/core': path.dirname(require.resolve('@wagmi/core/package.json')),
      '@tanstack/react-query': path.dirname(require.resolve('@tanstack/react-query/package.json')),
    };
    return config;
  },
};

const plugins = [withNx];

module.exports = composePlugins(...plugins)(nextConfig);
