import type { JawTheme } from '@jaw.id/core';

/**
 * Builds a JawTheme from the playground's OWN design tokens so the embedded
 * keys dialog inherits the app's look automatically — no manual theme picker.
 *
 * The playground authors its tokens in oklch (Tailwind v4); JawTheme's
 * accentColor is a hex string, so we let the browser normalize whatever color
 * space the token uses into hex via a canvas context.
 */

/** Resolve any CSS color string (oklch/hsl/rgb/named) to #rrggbb, or undefined. */
function colorToHex(raw: string): string | undefined {
  const value = raw.trim();
  if (!value) return undefined;
  const ctx = document.createElement('canvas').getContext('2d');
  if (!ctx) return undefined;
  // Canvas normalizes the fillStyle getter to '#rrggbb' (opaque) or 'rgba(...)'.
  ctx.fillStyle = '#000000';
  ctx.fillStyle = value;
  const normalized = ctx.fillStyle;
  if (normalized.startsWith('#')) return normalized;
  const m = normalized.match(/\d+(\.\d+)?/g);
  if (!m || m.length < 3) return undefined;
  const toHex = (n: number) => Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, '0');
  return `#${toHex(Number(m[0]))}${toHex(Number(m[1]))}${toHex(Number(m[2]))}`;
}

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
 * Read the playground's `--primary` / `--radius` tokens and its current mode,
 * and return a JawTheme to forward to the JAW connector.
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
    accentColor: colorToHex(readVar('--primary')),
    borderRadius: remToPreset(parseFloat(readVar('--radius'))),
  };
}
