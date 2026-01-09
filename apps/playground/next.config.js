//@ts-check

const { composePlugins, withNx } = require('@nx/next');

/**
 * @type {import('@nx/next/plugins/with-nx').WithNxOptions}
 **/
const nextConfig = {
  nx: {},
  transpilePackages: ['@jaw.id/core', '@jaw.id/ui', '@jaw.id/wagmi'],
};

const plugins = [
  withNx,
];

module.exports = composePlugins(...plugins)(nextConfig);
