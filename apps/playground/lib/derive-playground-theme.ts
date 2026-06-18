import type { JawTheme } from '@jaw.id/core';

/**
 * Builds a JawTheme from the playground's OWN design tokens so the embedded
 * keys dialog matches the app's mode and shape automatically — no manual theme
 * picker.
 *
 * Accent color is intentionally NOT forwarded. keys remaps `--primary` /
 * `--ring` from a dApp `accentColor`, which only repaints the primary-variant
 * controls (e.g. the "Create Account" button) and leaves outline/ghost buttons
 * on keys' own palette — an inconsistent half-themed look. Keeping accent off
 * lets keys render its full, self-consistent brand palette regardless of the
 * host dApp's accent.
 */

function readVar(name: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

function remToPreset(rem: number): JawTheme['borderRadius'] {
  if (Number.isNaN(rem)) return undefined;
  if (rem <= 0.3) return 'sm';
  if (rem <= 0.6) return 'md';
  return 'lg';
}

/**
 * Read the playground's `--radius` token and its current mode, and return a
 * JawTheme to forward to the JAW connector.
 *
 * Mode is taken from the DOM ground truth — whether `<html>` carries the
 * `dark` class — NOT from next-themes' `resolvedTheme`, which is ambiguous
 * during hydration and across system/localStorage states. If the playground
 * renders light (no `dark` class), we send 'light', full stop. SSR-safe.
 */
export function derivePlaygroundTheme(): JawTheme {
  if (typeof window === 'undefined') return { mode: 'auto' };
  const isDark = document.documentElement.classList.contains('dark');
  return {
    mode: isDark ? 'dark' : 'light',
    borderRadius: remToPreset(parseFloat(readVar('--radius'))),
  };
}
