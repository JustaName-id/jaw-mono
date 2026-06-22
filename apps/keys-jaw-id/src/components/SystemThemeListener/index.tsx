'use client';

import { useEffect } from 'react';

import { THEME_MODE_ATTR, isModePinned } from '../../lib/apply-dapp-theme';

/**
 * Watches `prefers-color-scheme` for live changes and updates the
 * `light`/`dark` class on `<html>` accordingly.
 *
 * The initial class is set by the inline script in layout.tsx (runs
 * synchronously before paint, no flash). This component handles the
 * dynamic case where the user toggles their OS dark mode while the
 * popup is open.
 *
 * Yields to the dApp: once applyDappTheme pins an explicit `light`/`dark`
 * (recorded on `<html data-jaw-theme-mode>`), this listener stops touching
 * the mode so an OS flip can't override the dApp's choice. For `auto`/unset
 * (or no dApp theme at all) it keeps the page in sync with the OS.
 *
 * Renders nothing.
 */
export function SystemThemeListener(): null {
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const mql = window.matchMedia('(prefers-color-scheme: dark)');
    const apply = (matches: boolean): void => {
      const root = document.documentElement;
      if (isModePinned(root.getAttribute(THEME_MODE_ATTR))) return; // dApp owns the mode
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
