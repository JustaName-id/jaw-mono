import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // @jaw.id/core ships workspace TS/ESM the app consumes directly.
  transpilePackages: ['@jaw.id/core'],
};

export default nextConfig;
