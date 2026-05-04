/**
 * Theme resolution pipeline.
 *
 * Merges base palette, accent overrides, preset maps, and user CSS variables
 * into a single frozen record of CSS custom properties.
 */

import { JawTheme } from '@jaw.id/core';

import { DEFAULT_DARK_PALETTE, DEFAULT_LIGHT_PALETTE, BORDER_RADIUS_MAP, FONT_STACK_MAP } from './constants.js';
import { deriveAccentPalette, hexToOklch, oklchToString } from './palette.js';

export interface ResolvedTheme {
  readonly variables: Readonly<Record<string, string>>;
  readonly colorScheme: 'light' | 'dark';
}

/**
 * Resolve a `JawTheme` configuration into a flat set of CSS variables.
 *
 * Resolution order (later wins):
 * 1. Default palette (light or dark)
 * 2. Accent color overrides (derived from `accentColor`)
 * 3. Explicit `accentColorForeground` override
 * 4. Border radius & font stack presets
 * 5. Raw `cssVariables` (Layer 2 user overrides)
 */
export function resolveTheme(theme: JawTheme, systemMode: 'light' | 'dark'): ResolvedTheme {
  // 1. Determine effective color scheme
  const effectiveMode: 'light' | 'dark' = theme.mode === 'light' || theme.mode === 'dark' ? theme.mode : systemMode;

  // 2. Start with base palette
  const result: Record<string, string> = {
    ...(effectiveMode === 'dark' ? DEFAULT_DARK_PALETTE : DEFAULT_LIGHT_PALETTE),
  };

  // 3. Accent color overrides (gracefully fall back on invalid hex)
  if (theme.accentColor) {
    try {
      const accentVars = deriveAccentPalette(theme.accentColor, effectiveMode, theme.accentColorForeground);
      Object.assign(result, accentVars);
    } catch {
      // Invalid hex color — silently fall back to palette defaults
    }
  }

  // 4. Explicit foreground override (even without accentColor)
  if (theme.accentColorForeground && !theme.accentColor) {
    try {
      result['--jaw-color-primary-foreground'] = oklchToString(hexToOklch(theme.accentColorForeground));
    } catch {
      // Invalid hex — fall back to palette default
    }
  }

  // 5. Border radius preset
  if (theme.borderRadius) {
    result['--jaw-radius'] = BORDER_RADIUS_MAP[theme.borderRadius];
  }

  // 6. Font stack preset
  if (theme.fontStack) {
    result['--jaw-font-family'] = FONT_STACK_MAP[theme.fontStack];
  }

  // 7. Raw CSS variable overrides (highest priority)
  if (theme.cssVariables) {
    Object.assign(result, theme.cssVariables);
  }

  return Object.freeze({
    variables: Object.freeze(result),
    colorScheme: effectiveMode,
  });
}
