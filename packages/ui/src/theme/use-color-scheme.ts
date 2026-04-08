/**
 * Color scheme detection utilities.
 *
 * Provides both a React hook and a plain function for detecting the
 * effective color scheme for SDK dialogs.
 *
 * Resolution order (host app's class wins):
 *   1. `<html class="dark">` → dark (explicit, overrides OS)
 *   2. `<html class="light">` → light (explicit, overrides OS)
 *   3. `matchMedia('(prefers-color-scheme: dark)')` → OS preference
 *
 * The dual-class check is critical: if a host app uses next-themes
 * with `value={{ light: 'light', dark: 'dark' }}`, an "absent dark
 * class" doesn't unambiguously mean "light" — it could mean "system".
 * Reading both classes lets the SDK distinguish explicit user choice
 * from system fallback.
 *
 * The hook reactively updates when EITHER signal changes:
 *   - matchMedia change event (OS preference)
 *   - MutationObserver on <html class> (host app toggles theme class)
 */

import { useState, useEffect } from 'react';

const DARK_QUERY = '(prefers-color-scheme: dark)';

/**
 * Get the current effective color scheme (SSR-safe).
 *
 * Checks the host app's `dark`/`light` class on `<html>` first; if neither
 * is present, falls back to the OS `prefers-color-scheme`. Returns `'light'`
 * when `window` is undefined.
 */
export function getSystemColorScheme(): 'light' | 'dark' {
  if (typeof window === 'undefined') return 'light';
  const html = document.documentElement;
  // Explicit class on <html> wins over OS preference
  if (html.classList.contains('dark')) return 'dark';
  if (html.classList.contains('light')) return 'light';
  // Neither class set → trust OS preference
  return window.matchMedia(DARK_QUERY).matches ? 'dark' : 'light';
}

/**
 * React hook that tracks the effective color scheme.
 *
 * - SSR-safe: defaults to `'light'` during server rendering
 * - Subscribes to BOTH `matchMedia` change events (OS) and a
 *   MutationObserver on `<html>` (host app's theme class)
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

    // 2. Watch host app's theme class on <html>
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
