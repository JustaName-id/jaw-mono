import type { JawTheme } from '@jaw.id/core';
import { BORDER_RADIUS_MAP, hexToOklch, oklchToString, themeColorVar } from '@jaw.id/ui';

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
 * Scope: light/dark mode, accent color, border radius, font stack, plus fully
 * open `cssVariables` — every `--jaw-*` token is overridable (keys renders
 * per-dApp UI only, so the dApp owns the look end to end). Values are still
 * validated for shape: `--jaw-color-*` must be bare OKLCH channels (a wrapped
 * `oklch(...)`/hex nests inside the package's `oklch(var(x) / alpha)` wrapper
 * and is silently dropped by the browser), and everything is length-capped and
 * kept free of CSS structural characters.
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

/** Convert sRGB floats (0..1) to a shadcn HSL triplet string "H S% L%". */
function rgbToHslTriplet(r: number, g: number, b: number): string {
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

/** Convert a hex color to a shadcn HSL triplet string "H S% L%". */
export function hexToHslTriplet(hex: string): string | null {
  const rgb = parseHex(hex);
  if (!rgb) return null;
  return rgbToHslTriplet(...rgb);
}

/** Bare OKLCH channels, the only value form `--jaw-color-*` accepts ("0.28 0.04 177"). */
const OKLCH_CHANNELS_RE = /^\d*\.?\d+\s+\d*\.?\d+\s+\d*\.?\d+$/;

/**
 * Convert bare OKLCH channels ("L C H") to a shadcn HSL triplet, the inverse
 * of @jaw.id/ui's hex → OKLCH chain (Ottosson matrices), with linear-sRGB
 * clamping for out-of-gamut values. Returns null for anything that isn't a
 * plain channel triplet.
 */
export function oklchChannelsToHslTriplet(channels: string): string | null {
  const trimmed = channels.trim();
  if (!OKLCH_CHANNELS_RE.test(trimmed)) return null;
  const [L, C, H] = trimmed.split(/\s+/).map(Number);
  const hr = (H * Math.PI) / 180;
  const a = C * Math.cos(hr);
  const bLab = C * Math.sin(hr);
  // OKLab -> LMS' -> linear sRGB (Björn Ottosson's reference matrices)
  const l3 = (L + 0.3963377774 * a + 0.2158037573 * bLab) ** 3;
  const m3 = (L - 0.1055613458 * a - 0.0638541728 * bLab) ** 3;
  const s3 = (L - 0.0894841775 * a - 1.291485548 * bLab) ** 3;
  const lin = [
    4.0767416621 * l3 - 3.3077115913 * m3 + 0.2309699292 * s3,
    -1.2684380046 * l3 + 2.6097574011 * m3 - 0.3413193965 * s3,
    -0.0041960863 * l3 - 0.7034186147 * m3 + 1.707614701 * s3,
  ];
  const [r, g, b] = lin.map((c) => {
    const clamped = Math.min(1, Math.max(0, c));
    return clamped <= 0.0031308 ? 12.92 * clamped : 1.055 * clamped ** (1 / 2.4) - 0.055;
  });
  return rgbToHslTriplet(r, g, b);
}

/** Relative luminance (0..1) of a hex color, for foreground contrast. */
export function luminance(hex: string): number {
  const rgb = parseHex(hex);
  if (!rgb) return 0;
  return 0.2126 * rgb[0] + 0.7152 * rgb[1] + 0.0722 * rgb[2];
}

/**
 * `--jaw-color-*` tokens with a keys-side HSL twin, mapped so a dApp override
 * feeds both stylesheets (see module docs). This is a MIRROR MAP, not an
 * allowlist: any `--jaw-*` name is accepted, and names without a twin here
 * (e.g. `--jaw-color-destructive-hover`, `--jaw-color-halo`, future tokens)
 * pass through verbatim — the package stylesheet consumes them directly.
 */
const CSS_VAR_MIRROR: Readonly<Record<string, string>> = {
  '--jaw-color-background': '--background',
  '--jaw-color-foreground': '--foreground',
  '--jaw-color-card': '--card',
  '--jaw-color-card-foreground': '--card-foreground',
  '--jaw-color-popover': '--popover',
  '--jaw-color-popover-foreground': '--popover-foreground',
  '--jaw-color-primary': '--primary',
  '--jaw-color-primary-foreground': '--primary-foreground',
  '--jaw-color-secondary': '--secondary',
  '--jaw-color-secondary-foreground': '--secondary-foreground',
  '--jaw-color-muted': '--muted',
  '--jaw-color-muted-foreground': '--muted-foreground',
  '--jaw-color-accent': '--accent',
  '--jaw-color-accent-foreground': '--accent-foreground',
  '--jaw-color-border': '--border',
  '--jaw-color-input': '--input',
  '--jaw-color-ring': '--ring',
  '--jaw-color-destructive': '--destructive',
  '--jaw-color-destructive-foreground': '--destructive-foreground',
  '--jaw-color-success': '--success',
  '--jaw-color-success-foreground': '--success-foreground',
  '--jaw-color-warning': '--warning',
  '--jaw-color-warning-foreground': '--warning-foreground',
  '--jaw-color-info': '--info',
  '--jaw-color-info-foreground': '--info-foreground',
  '--jaw-color-positive': '--positive',
  '--jaw-color-negative': '--negative',
  '--jaw-color-scrim': '--scrim',
  '--jaw-color-shadow': '--shadow-color',
};

/** Any `--jaw-*` custom property name a dApp may set. */
const JAW_VAR_NAME_RE = /^--jaw-[a-z][a-z0-9-]*$/;
/** Length-capped, no CSS structural characters — the value lands in setProperty verbatim. */
const SAFE_VALUE_RE = /^[^;{}]{1,256}$/;

const RADIUS_VALUE_RE = /^\d*\.?\d+(rem|px|em)$/;
const FONT_FAMILY_VALUE_RE = /^[\w\s,"'-]{1,256}$/;

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

/**
 * Every inline property a previous applyDappTheme call set on a given root,
 * so the next call can clear them first and stay declarative — a theme update
 * that drops a value (e.g. switching a full-skin preset back to default)
 * reverts to keys' own stylesheet palette instead of the stale inline
 * override persisting forever.
 */
const appliedProps = new WeakMap<object, Set<string>>();

export function applyDappTheme(theme: JawTheme, win: Window = window): void {
  const root = win.document?.documentElement;
  if (!root) return;

  const previouslyApplied = appliedProps.get(root);
  if (previouslyApplied) {
    for (const name of previouslyApplied) root.style.removeProperty?.(name);
  }
  const applied = new Set<string>();
  appliedProps.set(root, applied);
  const setProp = (name: string, value: string) => {
    root.style.setProperty(name, value);
    applied.add(name);
  };

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
      setProp('--primary', triplet);
      setProp('--ring', triplet);
      const fg = theme.accentColorForeground
        ? hexToHslTriplet(theme.accentColorForeground)
        : luminance(theme.accentColor) > 0.5
          ? FG_DARK
          : FG_LIGHT;
      if (fg) setProp('--primary-foreground', fg);
    }

    // …and the same accent in the package's own tokens, reusing its converters so the two can't
    // drift. Channels, not `oklch(...)`: the theme wraps them for the alpha modifier.
    const accent = oklchToString(hexToOklch(theme.accentColor));
    if (accent) {
      setProp('--jaw-color-primary', accent);
      setProp('--jaw-color-ring', accent);
      const jawFg = theme.accentColorForeground
        ? oklchToString(hexToOklch(theme.accentColorForeground))
        : luminance(theme.accentColor) > 0.5
          ? JAW_FG_DARK
          : JAW_FG_LIGHT;
      setProp('--jaw-color-primary-foreground', jawFg);
    }
  }

  // Border radius preset → --radius (keys) and --jaw-radius (the package).
  if (theme.borderRadius) {
    setProp('--radius', RADIUS_REM[theme.borderRadius]);
    setProp('--jaw-radius', BORDER_RADIUS_MAP[theme.borderRadius]);
  }

  // Font stack preset → --app-font-family (consumed by `html` in global.css).
  if (theme.fontStack) {
    setProp('--app-font-family', FONT_STACK[theme.fontStack]);
  }

  // Semantic `colors` palette — the modular re-skin API. Plain hex per token;
  // each lands in the package's channel token and, where a keys twin exists,
  // in keys' own HSL token. Runs after accent (explicit colors win) and before
  // cssVariables, matching resolveTheme's precedence in @jaw.id/ui.
  if (theme.colors) {
    for (const [key, hex] of Object.entries(theme.colors)) {
      if (typeof hex !== 'string') continue;
      const triplet = hexToHslTriplet(hex);
      if (!triplet) continue; // invalid hex — keep the default
      const jawVar = themeColorVar(key);
      setProp(jawVar, oklchToString(hexToOklch(hex)));
      const mirror = CSS_VAR_MIRROR[jawVar];
      if (mirror) setProp(mirror, triplet);
    }
  }

  // Layer 2: granular `cssVariables` overrides (full re-skins). Applied last so
  // they outrank the simple props, matching resolveTheme's precedence in
  // @jaw.id/ui. Fully open — any `--jaw-*` token — with shape validation only.
  // Colors are written verbatim into the package's channel tokens and, where a
  // keys twin exists, mirrored into keys' own HSL tokens so keys' native
  // components re-skin along with the dialogs.
  if (theme.cssVariables) {
    for (const [name, raw] of Object.entries(theme.cssVariables)) {
      const value = typeof raw === 'string' ? raw.trim() : '';
      if (!JAW_VAR_NAME_RE.test(name) || !SAFE_VALUE_RE.test(value)) continue;
      if (name.startsWith('--jaw-color-')) {
        const hsl = oklchChannelsToHslTriplet(value);
        if (!hsl) continue; // wrapped color / garbage — reject whole entry
        setProp(name, value);
        const mirror = CSS_VAR_MIRROR[name];
        if (mirror) setProp(mirror, hsl);
      } else if (name === '--jaw-radius') {
        if (!RADIUS_VALUE_RE.test(value)) continue;
        setProp('--jaw-radius', value);
        setProp('--radius', value);
      } else if (name === '--jaw-font-family') {
        if (!FONT_FAMILY_VALUE_RE.test(value)) continue;
        setProp('--jaw-font-family', value);
        setProp('--app-font-family', value);
      } else {
        // Unmirrored non-color token (future additions): pass through verbatim.
        setProp(name, value);
      }
    }
  }
}
