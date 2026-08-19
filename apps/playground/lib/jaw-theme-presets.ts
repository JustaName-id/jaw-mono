import type { JawTheme } from '@jaw.id/core';

/**
 * Full-skin theme presets for the SDK dialogs, built on the semantic `colors`
 * palette (Layer 2 of the theme system): plain hex per token, converted to the
 * SDK's internal color spaces automatically. Works in both modes — AppSpecific
 * resolves it in ReactUIHandler, CrossPlatform ships it to the keys dialog
 * which mirrors each color into its own palette. The presets also override the
 * semantic status tokens (warning/positive/negative/…) to demonstrate that
 * every dialog element re-skins. `cssVariables` remains available as a
 * lower-level escape hatch but is not needed here.
 */

export interface JawThemePreset {
  readonly label: string;
  /** Swatch color for the picker button (any CSS color). */
  readonly swatch: string;
  readonly theme: JawTheme;
}

export const JAW_THEME_PRESETS: readonly JawThemePreset[] = [
  {
    label: 'Forest',
    swatch: '#0E2F28',
    theme: {
      mode: 'dark',
      borderRadius: 'lg',
      colors: {
        background: '#0E2F28',
        foreground: '#ECFDF5',
        card: '#123A31',
        cardForeground: '#ECFDF5',
        popover: '#123A31',
        popoverForeground: '#ECFDF5',
        primary: '#34E3A0',
        primaryForeground: '#052E22',
        secondary: '#17453B',
        secondaryForeground: '#ECFDF5',
        muted: '#17453B',
        mutedForeground: '#93C0B1',
        accent: '#17453B',
        accentForeground: '#ECFDF5',
        border: '#1F5449',
        input: '#1F5449',
        ring: '#34E3A0',
        // Status colors re-skinned too — warm gold warnings, mint positives.
        warning: '#F5C24B',
        warningForeground: '#052E22',
        success: '#3FD08F',
        successForeground: '#052E22',
        positive: '#34E3A0',
        negative: '#F0836E',
        destructive: '#C2452F',
        destructiveForeground: '#ECFDF5',
        scrim: '#04150F',
        halo: '#DFF7EC',
        identiconTile: '#17453B',
      },
    },
  },
  {
    label: 'Grape',
    swatch: '#291A3E',
    theme: {
      mode: 'dark',
      borderRadius: 'lg',
      colors: {
        background: '#291A3E',
        foreground: '#F5F0FF',
        card: '#33224C',
        cardForeground: '#F5F0FF',
        popover: '#33224C',
        popoverForeground: '#F5F0FF',
        primary: '#EDE4FF',
        primaryForeground: '#2A1B3D',
        secondary: '#3E2A5C',
        secondaryForeground: '#F5F0FF',
        muted: '#3E2A5C',
        mutedForeground: '#B7A6D6',
        accent: '#3E2A5C',
        accentForeground: '#F5F0FF',
        border: '#4A3568',
        input: '#4A3568',
        ring: '#A78BFA',
        // Status colors re-skinned too.
        warning: '#F2C063',
        warningForeground: '#2A1B3D',
        success: '#7BDCA9',
        successForeground: '#2A1B3D',
        positive: '#7BDCA9',
        negative: '#F58EA0',
        destructive: '#C24560',
        destructiveForeground: '#F5F0FF',
        scrim: '#120A1E',
        halo: '#E7DCF9',
        identiconTile: '#3E2A5C',
      },
    },
  },
];

/** Returns the label of the preset the current theme matches, if any. */
export function activePresetLabel(theme: JawTheme): string | undefined {
  return JAW_THEME_PRESETS.find((p) => theme.colors?.background === p.theme.colors?.background)?.label;
}
