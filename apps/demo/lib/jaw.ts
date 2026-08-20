import { JAW } from '@jaw.id/core';

// One CrossPlatform SDK instance for the whole demo. The iframe transport is
// persistent: it mounts hidden + handshakes once (prewarm on provider
// construction) and every later request re-shows the same keys.jaw.id iframe,
// so the wallet session survives across demo screens without reconnecting.
let sdk: ReturnType<typeof JAW.create> | null = null;

export function getJaw() {
  if (typeof window === 'undefined') return null;
  if (!sdk) {
    sdk = JAW.create({
      apiKey: process.env.NEXT_PUBLIC_API_KEY || '',
      appName: 'JAW Hero Demo',
      appLogoUrl: 'https://avatars.githubusercontent.com/u/159771991?s=200&v=4',
      defaultChainId: 84532, // Base Sepolia
      preference: {
        // Explicit local/preview keys override, same convention as playground.
        ...(process.env.NEXT_PUBLIC_KEYS_URL ? { keysUrl: process.env.NEXT_PUBLIC_KEYS_URL } : {}),
        showTestnets: true,
        // iframe requires a secure context; on plain http://localhost the SDK
        // falls back to the popup on its own.
        transportMode: 'iframe',
      },
    });
  }
  return sdk;
}

// Constructing the provider prewarms the hidden keys iframe (mount + handshake)
// before the user ever taps a CTA, so the first dialog opens instantly.
export function prewarmJaw() {
  const jaw = getJaw();
  if (!jaw) return null;
  const { provider } = jaw;
  return provider;
}
