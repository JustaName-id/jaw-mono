import { defineConfig } from 'vitest/config';

export default defineConfig({
  // Use the automatic JSX runtime (matches the app's tsconfig react-jsx) so
  // .tsx component tests don't need an explicit React import.
  esbuild: { jsx: 'automatic' },
  test: {
    // Run once and exit. The Nx-inferred `test` target invokes `vitest` (not
    // `vitest run`), which would otherwise start watch mode in an interactive
    // terminal — hanging the pre-push hook. Mirrors packages/wagmi.
    watch: false,
    globals: true,
    environment: 'node',
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
    exclude: ['**/node_modules/**', '**/.next/**'],
  },
});
