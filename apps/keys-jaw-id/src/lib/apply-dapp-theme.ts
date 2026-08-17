import type { JawTheme } from '@jaw.id/core';
import { BORDER_RADIUS_MAP, hexToOklch, oklchToString } from '@jaw.id/ui';

// Imported (not just re-exported) because applyDappTheme below writes the attribute itself.
// Re-exported so existing importers of this module keep working.
import { THEME_MODE_ATTR, isModePinned } from './theme-mode';

export { THEME_MODE_ATTR, isModePinned };

/**
 * Applies a dApp-provided JawTheme to the keys app.
 *
 * Two token systems have to be fed, because two stylesheets are in play:
 *
 *   keys' own  — shadcn HSL triplets (`--primary: 222 47% 11%`, read as `hsl(var(--primary))`)
 *   @jaw.id/ui — `--jaw-color-*` oklch channels, read as `oklch(var(--x) / <alpha-value>)`
 *
 * The package's utilities are scoped as `[data-jaw-ui] .foo`, which outranks keys' own `.foo`
 * inside the shell — so writing only keys' names left the dApp's accent silently ignored by both
 * the dialogs and keys' own components. Both are written here; the formats are not
 * interchangeable, so each needs its own conversion.
 *
 * Scope: light/dark mode, accent color, border radius, font stack. Background
 * and other tokens stay under keys' own light/dark palette.
 *
 * Mode persistence: an explicit `light`/`dark` is *pinned* — recorded on
 * `<html data-jaw-theme-mode>` so SystemThemeListener stops following the OS
 * and the dApp's choice survives an OS color-scheme flip. `auto`/unset records
 * `auto`, leaving the OS listener in charge.
 */

/**
 * Font stacks, mirroring @jaw.id/ui's FONT_STACK_MAP so the embedded keys
 * dialog and the AppSpecific dialog render identical typography.
 */
const FONT_STACK: Record<NonNullable<JawTheme['fontStack']>, string> = {
  system:
    'ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
  rounded: '"Nunito", "SF Pro Rounded", ui-rounded, "Hiragino Maru Gothic ProN", sans-serif',
  mono: 'ui-monospace, "SF Mono", "Cascadia Code", "Segoe UI Mono", Menlo, Consolas, monospace',
};

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

// The same two, as oklch channels for the package's tokens.
const JAW_FG_DARK = '0.2077 0.0398 265.755';
const JAW_FG_LIGHT = '0.9842 0.0034 247.858';

export function applyDappTheme(theme: JawTheme, win: Window = window): void {
  const root = win.document?.documentElement;
  if (!root) return;

  // Mode: explicit light/dark, or follow the system for 'auto'/unset.
  const pinned = theme.mode === 'light' || theme.mode === 'dark';
  const mode = pinned ? theme.mode : win.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  // Record the dApp's intent so SystemThemeListener yields mode control when
  // the dApp pinned an explicit light/dark, but keeps following the OS for
  // 'auto'/unset. Without this, an OS flip would override the dApp's choice.
  root.setAttribute?.(THEME_MODE_ATTR, pinned ? mode : 'auto');
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

    // …and the same accent in the package's own tokens, reusing its converters so the two can't
    // drift. Channels, not `oklch(...)`: the theme wraps them for the alpha modifier.
    const accent = oklchToString(hexToOklch(theme.accentColor));
    if (accent) {
      root.style.setProperty('--jaw-color-primary', accent);
      root.style.setProperty('--jaw-color-ring', accent);
      const jawFg = theme.accentColorForeground
        ? oklchToString(hexToOklch(theme.accentColorForeground))
        : luminance(theme.accentColor) > 0.5
          ? JAW_FG_DARK
          : JAW_FG_LIGHT;
      root.style.setProperty('--jaw-color-primary-foreground', jawFg);
    }
  }

  // Border radius preset → --radius (keys) and --jaw-radius (the package).
  if (theme.borderRadius) {
    root.style.setProperty('--radius', RADIUS_REM[theme.borderRadius]);
    root.style.setProperty('--jaw-radius', BORDER_RADIUS_MAP[theme.borderRadius]);
  }

  // Font stack preset → --app-font-family (consumed by `html` in global.css).
  if (theme.fontStack) {
    root.style.setProperty('--app-font-family', FONT_STACK[theme.fontStack]);
  }
}
