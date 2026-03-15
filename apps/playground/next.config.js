//@ts-check

const path = require('path');
const { composePlugins, withNx } = require('@nx/next');

// Resolve workspace packages from monorepo root (next.config is in apps/playground)
const root = path.resolve(__dirname, '../..');
const packages = (name) => path.join(root, 'packages', name);

/**
 * @type {import('@nx/next/plugins/with-nx').WithNxOptions}
 **/
const nextConfig = {
  nx: {},
  // Only transpile UI (we load it from source). Core and wagmi must use pre-built dist (their source has .js imports that break when bundled from .ts)
  transpilePackages: ['@jaw.id/ui'],
  experimental: {
    optimizePackageImports: ['lucide-react'],
    // Turbopack resolveAlias must be relative to project (no absolute paths)
    turbo: {
      resolveAlias: {
        '@jaw.id/core': '../../packages/core/dist/index.js',
        '@jaw.id/wagmi': '../../packages/wagmi/dist/index.js',
      },
    },
  },
  webpack: (config) => {
    config.resolve.alias = {
      ...config.resolve.alias,
      // Point to built dist so we never load source (source uses .js in imports, breaks Turbopack/bundler)
      '@jaw.id/core': path.join(packages('core'), 'dist', 'index.js'),
      '@jaw.id/wagmi': path.join(packages('wagmi'), 'dist', 'index.js'),
      // UI package: point to source so Next can transpile (no dist when build fails)
      '@jaw.id/ui': path.join(packages('ui'), 'src', 'index.ts'),
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
