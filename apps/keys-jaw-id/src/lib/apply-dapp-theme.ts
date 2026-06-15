import type { JawTheme } from '@jaw.id/core';

/**
 * Applies a dApp-provided JawTheme to the keys app (minimal theme sync).
 *
 * keys uses shadcn-style HSL-triplet tokens (`--primary: 222 47% 11%`,
 * consumed as `hsl(var(--primary))`), NOT @jaw.id/ui's oklch tokens — so we
 * translate into keys' own variable names/format here rather than reusing
 * @jaw.id/ui's applyThemeToContainer (which would write `oklch(...)` into
 * vars keys wraps in `hsl(...)`, producing invalid colors → transparency).
 *
 * Scope (minimal): light/dark mode, accent color, border radius. Background
 * and other tokens stay under keys' own light/dark palette.
 */

/** Parse a #rgb or #rrggbb hex string into [r,g,b] in 0..1, or null. */
function parseHex(hex: string): [number, number, number] | null {
  let h = hex.trim().replace(/^#/, '');
  if (h.length === 3)
    h = h
      .split('')
      .map((c) => c + c)
      .join('');
  if (!/^[0-9a-fA-F]{6}$/.test(h)) return null;
  return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16) / 255) as [number, number, number];
}

/** Convert a hex color to a shadcn HSL triplet string "H S% L%". */
export function hexToHslTriplet(hex: string): string | null {
  const rgb = parseHex(hex);
  if (!rgb) return null;
  const [r, g, b] = rgb;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  let h = 0;
  let s = 0;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    if (max === r) h = (g - b) / d + (g < b ? 6 : 0);
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h /= 6;
  }
  return `${Math.round(h * 360)} ${Math.round(s * 100)}% ${Math.round(l * 100)}%`;
}

/** Relative luminance (0..1) of a hex color, for foreground contrast. */
export function luminance(hex: string): number {
  const rgb = parseHex(hex);
  if (!rgb) return 0;
  return 0.2126 * rgb[0] + 0.7152 * rgb[1] + 0.0722 * rgb[2];
}

const RADIUS_REM: Record<NonNullable<JawTheme['borderRadius']>, string> = {
  sm: '0.25rem',
  md: '0.5rem',
  lg: '0.75rem',
};

// keys' default foregrounds (shadcn HSL triplets)
const FG_DARK = '222.2 47.4% 11.2%';
const FG_LIGHT = '210 40% 98%';

export function applyDappTheme(theme: JawTheme, win: Window = window): void {
  const root = win.document?.documentElement;
  if (!root) return;

  // Mode: explicit light/dark, or follow the system for 'auto'/unset.
  const mode =
    theme.mode === 'light' || theme.mode === 'dark'
      ? theme.mode
      : win.matchMedia?.('(prefers-color-scheme: dark)').matches
        ? 'dark'
        : 'light';
  // Manage the same classes/colorScheme as SystemThemeListener so the dApp
  // mode fully takes over (toggling only `dark` left the `light` class and
  // color-scheme from the OS-following inline script in place).
  root.classList.remove('light', 'dark');
  root.classList.add(mode);
  root.style.colorScheme = mode;

  // Accent → --primary / --ring, with a contrast-aware --primary-foreground.
  if (theme.accentColor) {
    const triplet = hexToHslTriplet(theme.accentColor);
    if (triplet) {
      root.style.setProperty('--primary', triplet);
      root.style.setProperty('--ring', triplet);
      const fg = theme.accentColorForeground
        ? hexToHslTriplet(theme.accentColorForeground)
        : luminance(theme.accentColor) > 0.5
          ? FG_DARK
          : FG_LIGHT;
      if (fg) root.style.setProperty('--primary-foreground', fg);
    }
  }

  // Border radius preset → --radius.
  if (theme.borderRadius) {
    root.style.setProperty('--radius', RADIUS_REM[theme.borderRadius]);
  }
}
