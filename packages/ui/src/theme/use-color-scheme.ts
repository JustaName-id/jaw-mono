/**
 * Color scheme detection utilities.
 *
 * Provides both a React hook and a plain function for detecting
 * the user's system color scheme preference.
 */

import { useState, useEffect } from 'react';

const DARK_QUERY = '(prefers-color-scheme: dark)';

/**
 * Get the current system color scheme (SSR-safe).
 * Returns `'light'` when `window` is not available.
 */
export function getSystemColorScheme(): 'light' | 'dark' {
  if (typeof window === 'undefined') return 'light';
  return window.matchMedia(DARK_QUERY).matches ? 'dark' : 'light';
}

/**
 * React hook that tracks the system color scheme preference.
 *
 * - SSR-safe: defaults to `'light'` during server rendering
 * - Subscribes to `matchMedia` change events
 * - Cleans up listener on unmount
 */
export function useColorScheme(): 'light' | 'dark' {
  const [scheme, setScheme] = useState<'light' | 'dark'>(getSystemColorScheme);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const mql = window.matchMedia(DARK_QUERY);

    const handleChange = (event: MediaQueryListEvent): void => {
      setScheme(event.matches ? 'dark' : 'light');
    };

    mql.addEventListener('change', handleChange);

    return () => {
      mql.removeEventListener('change', handleChange);
    };
  }, []);

  return scheme;
}
