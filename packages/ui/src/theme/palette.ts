/**
 * OKLCH palette generation from hex colors.
 *
 * Conversion chain: Hex -> sRGB -> Linear RGB -> XYZ D65 -> OKLab -> OKLCH
 */

export interface Oklch {
  readonly l: number;
  readonly c: number;
  readonly h: number;
}

// --- sRGB gamma decode ---

function srgbToLinear(value: number): number {
  return value <= 0.04045 ? value / 12.92 : Math.pow((value + 0.055) / 1.055, 2.4);
}

// --- Hex -> sRGB (0-1 floats) ---

function hexToSrgb(hex: string): readonly [number, number, number] {
  const cleaned = hex.replace(/^#/, '');
  if (cleaned.length !== 6 && cleaned.length !== 3) {
    throw new Error(`Invalid hex color: ${hex}`);
  }
  const full =
    cleaned.length === 3 ? cleaned[0] + cleaned[0] + cleaned[1] + cleaned[1] + cleaned[2] + cleaned[2] : cleaned;
  const r = parseInt(full.slice(0, 2), 16) / 255;
  const g = parseInt(full.slice(2, 4), 16) / 255;
  const b = parseInt(full.slice(4, 6), 16) / 255;
  return [r, g, b] as const;
}

// --- Linear RGB -> XYZ D65 (standard 3x3 matrix) ---

function linearRgbToXyz(r: number, g: number, b: number): readonly [number, number, number] {
  const x = 0.4124564 * r + 0.3575761 * g + 0.1804375 * b;
  const y = 0.2126729 * r + 0.7151522 * g + 0.072175 * b;
  const z = 0.0193339 * r + 0.119192 * g + 0.9503041 * b;
  return [x, y, z] as const;
}

// --- XYZ D65 -> OKLab (via intermediate LMS with cube root) ---

function xyzToOklab(x: number, y: number, z: number): readonly [number, number, number] {
  // XYZ to LMS (M1 matrix from OKLab spec)
  const l = 0.8189330101 * x + 0.3618667424 * y - 0.1288597137 * z;
  const m = 0.0329845436 * x + 0.9293118715 * y + 0.0361456387 * z;
  const s = 0.0482003018 * x + 0.2643662691 * y + 0.633851707 * z;

  // Cube root
  const lCbrt = Math.cbrt(l);
  const mCbrt = Math.cbrt(m);
  const sCbrt = Math.cbrt(s);

  // LMS' to OKLab (M2 matrix)
  const L = 0.2104542553 * lCbrt + 0.793617785 * mCbrt - 0.0040720468 * sCbrt;
  const a = 1.9779984951 * lCbrt - 2.428592205 * mCbrt + 0.4505937099 * sCbrt;
  const b = 0.0259040371 * lCbrt + 0.7827717662 * mCbrt - 0.808675766 * sCbrt;

  return [L, a, b] as const;
}

// --- OKLab -> OKLCH ---

function oklabToOklch(L: number, a: number, b: number): Oklch {
  const c = Math.sqrt(a * a + b * b);
  let h = (Math.atan2(b, a) * 180) / Math.PI;
  if (h < 0) {
    h += 360;
  }
  return { l: L, c, h };
}

/**
 * Convert a hex color string to OKLCH color space.
 */
export function hexToOklch(hex: string): Oklch {
  const [r, g, b] = hexToSrgb(hex);
  const lr = srgbToLinear(r);
  const lg = srgbToLinear(g);
  const lb = srgbToLinear(b);
  const [x, y, z] = linearRgbToXyz(lr, lg, lb);
  const [L, a, bLab] = xyzToOklab(x, y, z);
  return oklabToOklch(L, a, bLab);
}

/**
 * Format an OKLCH value as a CSS `oklch(L C H)` string.
 * L and C use 3 decimal places; H uses 1 decimal place.
 */
export function oklchToString(oklch: Oklch): string {
  const l = oklch.l.toFixed(3);
  const c = oklch.c.toFixed(3);
  const h = oklch.h.toFixed(1);
  return `oklch(${l} ${c} ${h})`;
}

/**
 * Derive accent palette CSS variables from a single hex accent color.
 *
 * Sets `--jaw-color-primary` (buttons, key actions) and related tokens.
 * In dark mode, slightly lightens the accent for better visibility on dark backgrounds.
 */
export function deriveAccentPalette(
  accentHex: string,
  effectiveMode: 'light' | 'dark',
  accentColorForeground?: string
): Readonly<Record<string, string>> {
  const accent = hexToOklch(accentHex);

  // In dark mode, slightly lighten the accent for better contrast on dark backgrounds
  const adjustedAccent =
    effectiveMode === 'dark' && accent.l < 0.5
      ? { l: Math.min(accent.l + 0.15, 0.75), c: accent.c, h: accent.h }
      : accent;

  const primary = oklchToString(adjustedAccent);

  // Foreground: auto-detect from luminance, or use provided hex
  let foreground: string;
  if (accentColorForeground) {
    foreground = oklchToString(hexToOklch(accentColorForeground));
  } else {
    foreground = adjustedAccent.l > 0.6 ? 'oklch(0.205 0 0)' : 'oklch(0.985 0 0)';
  }

  // Ring: accent with reduced chroma (50%)
  const ring = oklchToString({
    l: adjustedAccent.l,
    c: adjustedAccent.c * 0.5,
    h: adjustedAccent.h,
  });

  // Accent hover: very subtle tint of the accent for hover backgrounds
  const accentHover = oklchToString({
    l: effectiveMode === 'dark' ? 0.25 : 0.95,
    c: accent.c * 0.15,
    h: accent.h,
  });

  return Object.freeze({
    '--jaw-color-primary': primary,
    '--jaw-color-primary-foreground': foreground,
    '--jaw-color-ring': ring,
    '--jaw-color-accent': accentHover,
    '--jaw-color-accent-foreground': primary,
  });
}
