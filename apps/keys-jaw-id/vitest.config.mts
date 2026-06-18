import { defineConfig } from 'vitest/config';

export default defineConfig({
  // Use the automatic JSX runtime (matches the app's tsconfig react-jsx) so
  // .tsx component tests don't need an explicit React import.
  esbuild: { jsx: 'automatic' },
  test: {
    globals: true,
    environment: 'node',
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
    exclude: ['**/node_modules/**', '**/.next/**'],
  },
});
