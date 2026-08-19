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
 * Semantic palette overrides. Every value is an ordinary hex color
 * (e.g. '#0E2F28') — the SDK converts to its internal color spaces, so
 * consumers never touch CSS variables. Omitted keys keep their defaults.
 */
export interface JawThemeColors {
    readonly background?: string;
    readonly foreground?: string;
    readonly card?: string;
    readonly cardForeground?: string;
    readonly popover?: string;
    readonly popoverForeground?: string;
    readonly primary?: string;
    readonly primaryForeground?: string;
    readonly secondary?: string;
    readonly secondaryForeground?: string;
    readonly muted?: string;
    readonly mutedForeground?: string;
    readonly accent?: string;
    readonly accentForeground?: string;
    readonly destructive?: string;
    readonly destructiveForeground?: string;
    readonly destructiveHover?: string;
    readonly success?: string;
    readonly successForeground?: string;
    readonly warning?: string;
    readonly warningForeground?: string;
    readonly info?: string;
    readonly infoForeground?: string;
    /** Incoming asset amounts ("You get"). */
    readonly positive?: string;
    /** Outgoing asset amounts ("You send"). */
    readonly negative?: string;
    readonly border?: string;
    readonly input?: string;
    readonly ring?: string;
    /** Modal overlay scrim (rendered at 50% alpha). */
    readonly scrim?: string;
    /** Animated edge glow on the dialog card. */
    readonly halo?: string;
    /** Tile behind account identicons. */
    readonly identiconTile?: string;
    /** Hairline ring around the identicon tile (rendered at 8% alpha). */
    readonly identiconRing?: string;
    /** Elevation shadow color. */
    readonly shadow?: string;
}

/**
 * Theme configuration for SDK UI components.
 *
 * Four layers of customization (later wins):
 * 1. Simple props (`mode`, `accentColor`, `borderRadius`) — covers 90% of use cases
 * 2. Semantic `colors` palette — full re-skins with plain hex values
 * 3. Granular `cssVariables` overrides — for power users (web only)
 * 4. Raw CSS on `[data-jaw-modal-container]` — escape hatch (no SDK changes needed)
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
    /** Semantic palette overrides as hex colors — the modular way to fully re-skin the dialogs. */
    readonly colors?: JawThemeColors;
    /** Granular CSS variable overrides (web only). Keys should be `--jaw-*` prefixed. Highest priority. */
    readonly cssVariables?: Readonly<Record<string, string>>;
}
