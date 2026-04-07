'use client';

import { useEffect } from 'react';

/**
 * Watches `prefers-color-scheme` for live changes and updates the
 * `light`/`dark` class on `<html>` accordingly.
 *
 * The initial class is set by the inline script in layout.tsx (runs
 * synchronously before paint, no flash). This component handles the
 * dynamic case where the user toggles their OS dark mode while the
 * popup is open.
 *
 * Renders nothing.
 */
export function SystemThemeListener(): null {
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const mql = window.matchMedia('(prefers-color-scheme: dark)');
    const apply = (matches: boolean): void => {
      const root = document.documentElement;
      root.classList.remove('light', 'dark');
      root.classList.add(matches ? 'dark' : 'light');
      root.style.colorScheme = matches ? 'dark' : 'light';
    };
    const handler = (e: MediaQueryListEvent): void => apply(e.matches);
    mql.addEventListener('change', handler);
    return () => {
      mql.removeEventListener('change', handler);
    };
  }, []);
  return null;
}
