/**
 * Default palettes and mapping tables for the JAW UI theme system.
 */

import { JawBorderRadius, JawFontStack } from '@jaw.id/core';

// ---------------------------------------------------------------------------
// Light palette
// ---------------------------------------------------------------------------

export const DEFAULT_LIGHT_PALETTE: Readonly<Record<string, string>> = Object.freeze({
  '--jaw-color-background': '1 0 0',
  '--jaw-color-foreground': '0.1363 0.0364 259.201',
  '--jaw-color-card': '1 0 0',
  '--jaw-color-card-foreground': '0.1363 0.0364 259.201',
  '--jaw-color-popover': '1 0 0',
  '--jaw-color-popover-foreground': '0.1363 0.0364 259.201',
  '--jaw-color-primary': '0.2077 0.0398 265.755',
  '--jaw-color-primary-foreground': '0.9842 0.0034 247.858',
  '--jaw-color-secondary': '0.9683 0.0069 247.896',
  '--jaw-color-secondary-foreground': '0.2077 0.0398 265.755',
  '--jaw-color-muted': '0.9683 0.0069 247.896',
  '--jaw-color-muted-foreground': '0.5544 0.0407 257.417',
  '--jaw-color-accent': '0.9683 0.0069 247.896',
  '--jaw-color-accent-foreground': '0.2077 0.0398 265.755',
  '--jaw-color-destructive': '0.6368 0.2078 25.331',
  '--jaw-color-destructive-foreground': '0.9842 0.0034 247.858',
  '--jaw-color-border': '0.9288 0.0126 255.508',
  '--jaw-color-input': '0.9288 0.0126 255.508',
  '--jaw-color-ring': '0.1363 0.0364 259.201',
  '--jaw-color-success': '0.7223 0.1932 149.478',
  '--jaw-color-success-foreground': '0.985 0 0',
  '--jaw-color-warning': '0.769 0.188 70.08',
  '--jaw-color-warning-foreground': '0.205 0 0',
  '--jaw-color-info': '0.623 0.214 259.815',
  '--jaw-color-info-foreground': '0.985 0 0',
});

// ---------------------------------------------------------------------------
// Dark palette
// ---------------------------------------------------------------------------

export const DEFAULT_DARK_PALETTE: Readonly<Record<string, string>> = Object.freeze({
  '--jaw-color-background': '0.1363 0.0364 259.201',
  '--jaw-color-foreground': '0.9842 0.0034 247.858',
  '--jaw-color-card': '0.1363 0.0364 259.201',
  '--jaw-color-card-foreground': '0.9842 0.0034 247.858',
  '--jaw-color-popover': '0.1363 0.0364 259.201',
  '--jaw-color-popover-foreground': '0.9842 0.0034 247.858',
  '--jaw-color-primary': '0.9842 0.0034 247.858',
  '--jaw-color-primary-foreground': '0.2077 0.0398 265.755',
  '--jaw-color-secondary': '0.2795 0.0368 260.031',
  '--jaw-color-secondary-foreground': '0.9842 0.0034 247.858',
  '--jaw-color-muted': '0.2795 0.0368 260.031',
  '--jaw-color-muted-foreground': '0.7107 0.0351 256.788',
  '--jaw-color-accent': '0.2795 0.0368 260.031',
  '--jaw-color-accent-foreground': '0.9842 0.0034 247.858',
  '--jaw-color-destructive': '0.3958 0.1331 25.723',
  '--jaw-color-destructive-foreground': '0.9842 0.0034 247.858',
  '--jaw-color-border': '0.2795 0.0368 260.031',
  '--jaw-color-input': '0.2795 0.0368 260.031',
  '--jaw-color-ring': '0.869 0.0198 252.894',
  '--jaw-color-success': '0.7064 0.1825 150.038',
  '--jaw-color-success-foreground': '0.985 0 0',
  '--jaw-color-warning': '0.769 0.188 70.08',
  '--jaw-color-warning-foreground': '0.920 0.150 80',
  '--jaw-color-info': '0.623 0.214 259.815',
  '--jaw-color-info-foreground': '0.985 0 0',
});

// ---------------------------------------------------------------------------
// Border radius presets
// ---------------------------------------------------------------------------

export const BORDER_RADIUS_MAP: Readonly<Record<JawBorderRadius, string>> = Object.freeze({
  sm: '0.375rem',
  md: '0.625rem',
  lg: '1rem',
});

// ---------------------------------------------------------------------------
// Font stack presets
// ---------------------------------------------------------------------------

export const FONT_STACK_MAP: Readonly<Record<JawFontStack, string>> = Object.freeze({
  system:
    'ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
  rounded: '"Nunito", "SF Pro Rounded", ui-rounded, "Hiragino Maru Gothic ProN", sans-serif',
  mono: 'ui-monospace, "SF Mono", "Cascadia Code", "Segoe UI Mono", Menlo, Consolas, monospace',
});
