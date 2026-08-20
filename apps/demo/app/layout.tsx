import type { Metadata } from 'next';
import { Inter, JetBrains_Mono, Playfair_Display } from 'next/font/google';
import './globals.css';

const inter = Inter({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-inter',
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ['latin'],
  weight: ['400', '500', '600'],
  variable: '--font-jbmono',
});

const playfair = Playfair_Display({
  subsets: ['latin'],
  weight: ['600', '700'],
  variable: '--font-playfair',
});

export const metadata: Metadata = {
  title: 'JAW — Hero Demo',
  description: 'Walk through exactly what your users do: sign in, send, swap and delegate with a JAW smart account.',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${inter.variable} ${jetbrainsMono.variable} ${playfair.variable} bg-paper text-ink font-sans leading-[1.45] antialiased [font-feature-settings:'ss01','cv01','tnum']`}
      >
        {children}
      </body>
    </html>
  );
}
