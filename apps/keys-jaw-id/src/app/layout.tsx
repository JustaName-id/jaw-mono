import './global.css';
import { headers } from 'next/headers';
import { ReactQueryProvider } from './providers/react-query';
import { ThemeProvider } from './providers/theme-provider';

export const metadata = {
  title: 'Welcome to keys-jaw-id',
  description: 'Keys Jaw ID',
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  // Reading headers() makes this layout dynamic (no static caching).
  // Next.js 14+ automatically reads the CSP nonce from the response header
  // set by middleware and stamps its own inline <script> tags with it.
  // We don't need to manually pass the nonce — calling headers() is enough
  // to opt into per-request rendering so the nonce is unique each time.
  await headers();

  return (
    <html lang="en" suppressHydrationWarning>
      <body className="bg-background text-foreground">
        <ThemeProvider
          attribute="class"
          defaultTheme="system"
          enableSystem
          disableTransitionOnChange
          value={{ light: 'light', dark: 'dark' }}
        >
          <ReactQueryProvider>
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
                style={{
                  height: '90vh',
                  width: 'auto',
                  opacity: 0.06,
                  userSelect: 'none',
                }}
                draggable={false}
              />
            </div>
            <div style={{ position: 'relative', zIndex: 1 }}>{children}</div>
          </ReactQueryProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
