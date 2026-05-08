import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { crx } from '@crxjs/vite-plugin';
import manifest from './manifest.config.js';

export default defineConfig(({ mode }) => {
  const apiKey = process.env.JAW_EXTENSION_API_KEY ?? '';
  if (mode === 'production' && !apiKey) {
    throw new Error(
      'JAW_EXTENSION_API_KEY env var must be set for production builds. ' + 'Set it via your shell or CI secret store.'
    );
  }
  return {
    plugins: [react(), crx({ manifest })],
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
