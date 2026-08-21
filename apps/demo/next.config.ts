import { composePlugins, withNx } from '@nx/next';
import type { WithNxOptions } from '@nx/next/plugins/with-nx';

const nextConfig: WithNxOptions = {
  nx: {},
  // @jaw.id/core ships workspace TS/ESM the app consumes directly.
  transpilePackages: ['@jaw.id/core'],
};

export default composePlugins(withNx)(nextConfig);
