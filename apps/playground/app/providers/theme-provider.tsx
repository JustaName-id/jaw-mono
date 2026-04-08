'use client';

import { ThemeProvider as NextThemesProvider, type ThemeProviderProps } from 'next-themes';

/**
 * Client-side wrapper for next-themes ThemeProvider.
 * Required because next-themes uses React context and must be a client component.
 */
export function ThemeProvider({ children, ...props }: ThemeProviderProps) {
  return <NextThemesProvider {...props}>{children}</NextThemesProvider>;
}
