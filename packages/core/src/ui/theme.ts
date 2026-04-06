/**
 * Platform-agnostic theme configuration for JAW SDK UI.
 *
 * This type is pure data — no CSS or DOM dependencies.
 * Web platforms resolve it to CSS variables; React Native resolves to StyleSheet values.
 */

/** Dark/light/auto mode selection */
export type JawThemeMode = 'light' | 'dark' | 'auto';

/** Border radius presets */
export type JawBorderRadius = 'sm' | 'md' | 'lg';

/** Font stack presets */
export type JawFontStack = 'system' | 'rounded' | 'mono';

/**
 * Theme configuration for SDK UI components.
 *
 * Three layers of customization:
 * 1. Simple props (`mode`, `accentColor`, `borderRadius`) — covers 90% of use cases
 * 2. Granular `cssVariables` overrides — for power users (web only)
 * 3. Raw CSS on `[data-jaw-modal-container]` — escape hatch (no SDK changes needed)
 */
export interface JawTheme {
    /** Color scheme: 'light', 'dark', or 'auto' (follows system preference). Default: 'auto' */
    readonly mode?: JawThemeMode;
    /** Primary/accent color as hex string, e.g. '#6366f1'. Used for buttons, links, focus rings. */
    readonly accentColor?: string;
    /** Foreground color for accent backgrounds. Auto-detected from accentColor luminance if omitted. */
    readonly accentColorForeground?: string;
    /** Border radius preset. Default: 'md' */
    readonly borderRadius?: JawBorderRadius;
    /** Font stack preset. Default: 'system' */
    readonly fontStack?: JawFontStack;
    /** Granular CSS variable overrides (web only). Keys should be `--jaw-*` prefixed. Highest priority. */
    readonly cssVariables?: Readonly<Record<string, string>>;
}
