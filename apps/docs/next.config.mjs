import { composePlugins, withNx } from '@nx/next';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const nextConfig = {
  nx: {},
  output: 'export',
  typescript: {
    ignoreBuildErrors: true,
  },
  webpack(config) {
    config.resolve.alias = {
      ...config.resolve.alias,
      'next-mdx-import-source-file': join(__dirname, 'mdx-components.tsx'),
    };
    return config;
  },
};

const plugins = [withNx];

export default async (phase, context) => {
  const nextra = (await import('nextra')).default;

  const withNextra = nextra({});

  return composePlugins(...plugins)(withNextra(nextConfig))(phase, context);
};