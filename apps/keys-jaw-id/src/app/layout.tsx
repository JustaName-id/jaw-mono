import './global.css';
import { ReactQueryProvider } from './providers/react-query';

export const metadata = {
  title: 'Welcome to keys-jaw-id',
  description: 'Keys Jaw ID',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {

  return (
    <html lang="en">
      <ReactQueryProvider>
        <body style={{ backgroundColor: '#f9fafb' }}>
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
          <div style={{ position: 'relative', zIndex: 1 }}>
            {children}
          </div>
        </body>
      </ReactQueryProvider>
    </html>
  )
}
