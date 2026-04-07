/**
 * Default palettes and mapping tables for the JAW UI theme system.
 */

import { JawBorderRadius, JawFontStack } from "@jaw.id/core";

// ---------------------------------------------------------------------------
// Light palette
// ---------------------------------------------------------------------------

export const DEFAULT_LIGHT_PALETTE: Readonly<Record<string, string>> =
  Object.freeze({
    "--jaw-color-background": "oklch(1 0 0)",
    "--jaw-color-foreground": "oklch(0.145 0 0)",
    "--jaw-color-card": "oklch(1 0 0)",
    "--jaw-color-card-foreground": "oklch(0.145 0 0)",
    "--jaw-color-popover": "oklch(1 0 0)",
    "--jaw-color-popover-foreground": "oklch(0.145 0 0)",
    "--jaw-color-primary": "oklch(0.205 0 0)",
    "--jaw-color-primary-foreground": "oklch(0.985 0 0)",
    "--jaw-color-secondary": "oklch(0.97 0 0)",
    "--jaw-color-secondary-foreground": "oklch(0.205 0 0)",
    "--jaw-color-muted": "oklch(0.97 0 0)",
    "--jaw-color-muted-foreground": "oklch(0.556 0 0)",
    "--jaw-color-accent": "oklch(0.97 0 0)",
    "--jaw-color-accent-foreground": "oklch(0.205 0 0)",
    "--jaw-color-destructive": "oklch(0.577 0.245 27.325)",
    "--jaw-color-destructive-foreground": "oklch(0.985 0 0)",
    "--jaw-color-border": "oklch(0.922 0 0)",
    "--jaw-color-input": "oklch(0.922 0 0)",
    "--jaw-color-ring": "oklch(0.708 0 0)",
    "--jaw-color-success": "oklch(0.627 0.194 145.071)",
    "--jaw-color-success-foreground": "oklch(0.985 0 0)",
    "--jaw-color-warning": "oklch(0.769 0.188 70.08)",
    "--jaw-color-warning-foreground": "oklch(0.205 0 0)",
    "--jaw-color-info": "oklch(0.623 0.214 259.815)",
    "--jaw-color-info-foreground": "oklch(0.985 0 0)",
  });

// ---------------------------------------------------------------------------
// Dark palette
// ---------------------------------------------------------------------------

export const DEFAULT_DARK_PALETTE: Readonly<Record<string, string>> =
  Object.freeze({
    "--jaw-color-background": "oklch(0.178 0 0)",
    "--jaw-color-foreground": "oklch(0.985 0 0)",
    "--jaw-color-card": "oklch(0.215 0 0)",
    "--jaw-color-card-foreground": "oklch(0.985 0 0)",
    "--jaw-color-popover": "oklch(0.215 0 0)",
    "--jaw-color-popover-foreground": "oklch(0.985 0 0)",
    "--jaw-color-primary": "oklch(0.985 0 0)",
    "--jaw-color-primary-foreground": "oklch(0.145 0 0)",
    "--jaw-color-secondary": "oklch(0.269 0 0)",
    "--jaw-color-secondary-foreground": "oklch(0.985 0 0)",
    "--jaw-color-muted": "oklch(0.269 0 0)",
    "--jaw-color-muted-foreground": "oklch(0.708 0 0)",
    "--jaw-color-accent": "oklch(0.269 0 0)",
    "--jaw-color-accent-foreground": "oklch(0.985 0 0)",
    "--jaw-color-destructive": "oklch(0.396 0.141 25.723)",
    "--jaw-color-destructive-foreground": "oklch(0.637 0.237 25.331)",
    "--jaw-color-border": "oklch(0.3 0 0)",
    "--jaw-color-input": "oklch(0.3 0 0)",
    "--jaw-color-ring": "oklch(0.439 0 0)",
    "--jaw-color-success": "oklch(0.627 0.194 145.071)",
    "--jaw-color-success-foreground": "oklch(0.985 0 0)",
    "--jaw-color-warning": "oklch(0.769 0.188 70.08)",
    "--jaw-color-warning-foreground": "oklch(0.920 0.150 80)",
    "--jaw-color-info": "oklch(0.623 0.214 259.815)",
    "--jaw-color-info-foreground": "oklch(0.985 0 0)",
  });

// ---------------------------------------------------------------------------
// Border radius presets
// ---------------------------------------------------------------------------

export const BORDER_RADIUS_MAP: Readonly<Record<JawBorderRadius, string>> =
  Object.freeze({
    sm: "0.375rem",
    md: "0.625rem",
    lg: "1rem",
  });

// ---------------------------------------------------------------------------
// Font stack presets
// ---------------------------------------------------------------------------

export const FONT_STACK_MAP: Readonly<Record<JawFontStack, string>> =
  Object.freeze({
    system:
      'ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
    rounded:
      '"Nunito", "SF Pro Rounded", ui-rounded, "Hiragino Maru Gothic ProN", sans-serif',
    mono: 'ui-monospace, "SF Mono", "Cascadia Code", "Segoe UI Mono", Menlo, Consolas, monospace',
  });
