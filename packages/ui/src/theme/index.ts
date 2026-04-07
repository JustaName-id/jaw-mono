/**
 * Theme resolution engine for @jaw.id/ui.
 *
 * Re-exports all public APIs from the theme module.
 */

// Palette generation
export { hexToOklch, oklchToString, deriveAccentPalette } from './palette.js';
export type { Oklch } from './palette.js';

// Default palettes and mapping tables
export { DEFAULT_LIGHT_PALETTE, DEFAULT_DARK_PALETTE, BORDER_RADIUS_MAP, FONT_STACK_MAP } from './constants.js';

// Resolution pipeline
export { resolveTheme } from './resolve-theme.js';
export type { ResolvedTheme } from './resolve-theme.js';

// DOM application
export { applyThemeToContainer } from './apply-theme.js';

// Color scheme detection
export { useColorScheme, getSystemColorScheme } from './use-color-scheme.js';
