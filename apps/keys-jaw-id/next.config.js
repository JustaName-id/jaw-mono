//@ts-check

const path = require('path');
const { composePlugins, withNx } = require('@nx/next');


/**
 * @type {import('@nx/next/plugins/with-nx').WithNxOptions}
 **/
const nextConfig = {
  // Use this to set Nx-specific options
  // See: https://nx.dev/recipes/next/next-config-setup
  nx: {},
  transpilePackages: ['@jaw.id/ui'],
  experimental: {
    optimizePackageImports: ['lucide-react'],
  },
  webpack: (config) => {
    // Replace the UI package's CSS with an empty override to prevent
    // conflicting oklch CSS variables and duplicate Tailwind utility classes.
    // The UI package's CSS uses oklch color values and var(--color) directly,
    // while this app uses HSL params with hsl(var(--color) / <alpha-value>)
    // for opacity modifier support. This app's own Tailwind config generates
    // all needed utilities from the UI package's source files.
    const overrideCss = path.resolve(__dirname, 'src/app/ui-overrides.css');
    config.resolve.alias[
      path.resolve(__dirname, '../../packages/ui/src/styles.css')
    ] = overrideCss;
    config.resolve.alias[
      path.resolve(__dirname, '../../packages/ui/dist/index.css')
    ] = overrideCss;
    return config;
  },
};

const plugins = [
  // Add more Next.js plugins to this list if needed.
  withNx,
];

module.exports = composePlugins(...plugins)(nextConfig);

