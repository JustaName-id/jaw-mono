import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { crx } from '@crxjs/vite-plugin';
import { nxViteTsPaths } from '@nx/vite/plugins/nx-tsconfig-paths.plugin';
import manifest from './manifest.config.js';

export default defineConfig(({ mode }) => {
  const apiKey = process.env.JAW_EXTENSION_API_KEY ?? '';
  // Only hard-fail when a release is actually being cut. CI sets CI=true; local
  // builds (incl. the pre-push hook running `nx run-many -t build`) bake in an
  // empty placeholder, which the offscreen SDK rejects at runtime — fine for
  // typecheck/lint passes that just need the bundle to compile.
  if (mode === 'production' && !apiKey && process.env.CI === 'true') {
    throw new Error(
      'JAW_EXTENSION_API_KEY env var must be set for production builds. ' + 'Set it via your shell or CI secret store.'
    );
  }
  return {
    // nxViteTsPaths must come BEFORE crx so workspace `@jaw.id/*` imports
    // resolve via tsconfig paths (to source) — the package.json `exports`
    // map's `@jaw-mono/source` condition would otherwise hand Rollup a `.ts`
    // file it can't load as a package entry in production builds.
    plugins: [nxViteTsPaths(), react(), crx({ manifest })],
    define: {
      __JAW_EXTENSION_API_KEY__: JSON.stringify(apiKey),
      __JAW_KEYS_URL__: JSON.stringify(process.env.JAW_KEYS_URL ?? 'https://keys.jaw.id'),
    },
    build: {
      outDir: 'dist',
      emptyOutDir: true,
      sourcemap: mode === 'development' ? 'inline' : false,
      rollupOptions: {
        input: {
          offscreen: 'src/offscreen/offscreen.html',
          inpage: 'src/inpage/inpage.ts',
          'keys-bridge-main': 'src/keys-bridge/keys-bridge-main.ts',
        },
        output: {
          entryFileNames: (chunkInfo) => {
            if (chunkInfo.name === 'inpage') return 'assets/inpage.js';
            if (chunkInfo.name === 'keys-bridge-main') return 'assets/keys-bridge-main.js';
            return 'assets/[name]-[hash].js';
          },
        },
      },
    },
    server: {
      port: 5174,
      strictPort: true,
      hmr: {
        port: 5175,
      },
    },
  };
});
