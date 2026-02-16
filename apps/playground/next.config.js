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

const plugins = [
  withNx,
];

module.exports = composePlugins(...plugins)(nextConfig);
