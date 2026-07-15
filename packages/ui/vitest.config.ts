import { resolve } from 'path';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    alias: {
      // Resolve the SDK to its TS source so tests don't require a built `dist`
      // (the Nx-inferred `test` target has no `^build` dependency, so core is
      // unbuilt in CI). Mirrors packages/wagmi and apps/keys-jaw-id.
      '@jaw.id/core': resolve(__dirname, '../../packages/core/src/index.ts'),
    },
  },
  test: {
    globals: true,
    environment: 'node',
    include: ['src/**/*.test.ts'],
    exclude: ['**/node_modules/**', '**/dist/**'],
  },
});
