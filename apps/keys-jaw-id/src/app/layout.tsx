import './global.css';
import { headers } from 'next/headers';
import { ReactQueryProvider } from './providers/react-query';
import { SystemThemeListener } from '../components/SystemThemeListener';

export const metadata = {
  title: 'Welcome to keys-jaw-id',
  description: 'Keys Jaw ID',
};

/**
 * Inline script that runs synchronously before any paint.
 * Reads `prefers-color-scheme` and sets `light`/`dark` class on <html>.
 *
 * This is intentionally NOT next-themes — keys.jaw.id is a popup that only
 * follows the OS theme; there's no toggle, no persistence, no React state
 * to manage. A 200-byte inline script is the simplest, most reliable
 * solution and has zero hydration concerns.
 */
const SET_INITIAL_THEME = `(function(){try{var d=document.documentElement;var m=window.matchMedia('(prefers-color-scheme: dark)').matches;d.classList.remove('light','dark');d.classList.add(m?'dark':'light');d.style.colorScheme=m?'dark':'light';}catch(e){}})();`;

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  // Reading headers() makes this layout dynamic (no static caching).
  // The middleware forwards the CSP nonce on the request as `x-nonce`; we
  // read it here and stamp our user-authored inline <script> with it so the
  // production CSP (`strict-dynamic`) does not block it.
  const requestHeaders = await headers();
  const nonce = requestHeaders.get('x-nonce') ?? undefined;

  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        {/*
         * suppressHydrationWarning is required because the browser strips the
         * `nonce` attribute from the DOM after CSP validation (security feature).
         * React then sees server `nonce="abc..."` vs client `nonce=""` and would
         * regenerate the tree without this hint. The script content itself is
         * static so suppressing the warning is safe.
         */}
        <script nonce={nonce} dangerouslySetInnerHTML={{ __html: SET_INITIAL_THEME }} suppressHydrationWarning />
      </head>
      <body className="bg-background text-foreground">
        <ReactQueryProvider>
          <SystemThemeListener />
          <div
            aria-hidden="true"
            style={{
              position: 'fixed',
              inset: 0,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              pointerEvents: 'none',
              zIndex: 0,
            }}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/jaw-logo.png"
              alt=""
              className="dark:invert"
              style={{
                height: '90vh',
                width: 'auto',
                opacity: 0.06,
                userSelect: 'none',
              }}
              draggable={false}
            />
          </div>
          <div style={{ position: 'relative' }}>{children}</div>
        </ReactQueryProvider>
      </body>
    </html>
  );
}
