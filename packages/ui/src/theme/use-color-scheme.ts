/**
 * Color scheme detection utilities.
 *
 * Provides both a React hook and a plain function for detecting the
 * effective color scheme for SDK dialogs.
 *
 * Resolution order (host app's `dark` class wins):
 *   1. `document.documentElement.classList.contains('dark')` (Tailwind /
 *      shadcn / Radix convention — host app explicitly set dark mode)
 *   2. `matchMedia('(prefers-color-scheme: dark)')` (OS preference)
 *
 * The hook reactively updates when EITHER signal changes:
 *   - matchMedia change event (OS preference)
 *   - MutationObserver on <html class> (host app toggles dark class)
 */

import { useState, useEffect } from 'react';

const DARK_QUERY = '(prefers-color-scheme: dark)';

/**
 * Get the current effective color scheme (SSR-safe).
 *
 * Checks the host app's `dark` class on `<html>` first; if not set, falls back
 * to the OS `prefers-color-scheme`. Returns `'light'` when `window` is undefined.
 */
export function getSystemColorScheme(): 'light' | 'dark' {
  if (typeof window === 'undefined') return 'light';
  // Host app's `dark` class on <html> wins (matches Tailwind/shadcn/Radix convention)
  if (document.documentElement.classList.contains('dark')) return 'dark';
  return window.matchMedia(DARK_QUERY).matches ? 'dark' : 'light';
}

/**
 * React hook that tracks the effective color scheme.
 *
 * - SSR-safe: defaults to `'light'` during server rendering
 * - Subscribes to BOTH `matchMedia` change events (OS) and a
 *   MutationObserver on `<html>` (host app's `dark` class)
 * - Cleans up both listeners on unmount
 */
export function useColorScheme(): 'light' | 'dark' {
  const [scheme, setScheme] = useState<'light' | 'dark'>(getSystemColorScheme);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const recompute = (): void => {
      setScheme(getSystemColorScheme());
    };

    // 1. Watch OS preference
    const mql = window.matchMedia(DARK_QUERY);
    mql.addEventListener('change', recompute);

    // 2. Watch host app's `dark` class on <html>
    const observer = new MutationObserver(recompute);
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['class'],
    });

    // Re-evaluate once after mount in case state changed before listeners attached
    recompute();

    return () => {
      mql.removeEventListener('change', recompute);
      observer.disconnect();
    };
  }, []);

  return scheme;
}
