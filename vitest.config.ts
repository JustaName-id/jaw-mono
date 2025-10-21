import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // All tests run with Vitest
    include: [
      'packages/core/src/**/*.test.ts',
    ],
    exclude: [
      '**/node_modules/**',
      '**/dist/**',
    ],
  },
});

