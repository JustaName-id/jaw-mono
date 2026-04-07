'use client';

import { ThemeProvider as NextThemesProvider, type ThemeProviderProps } from 'next-themes';

/**
 * Client-side wrapper for next-themes ThemeProvider.
 * keys.jaw.id uses system theme only — no manual toggle, no persistence.
 * The popup follows the OS color scheme automatically.
 */
export function ThemeProvider({ children, ...props }: ThemeProviderProps) {
  return <NextThemesProvider {...props}>{children}</NextThemesProvider>;
}
