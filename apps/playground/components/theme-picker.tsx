'use client';

import { useState } from 'react';
import type { JawTheme, JawThemeMode, JawBorderRadius, JawThemeColors } from '@jaw.id/core';
import { DEFAULT_LIGHT_PALETTE, DEFAULT_DARK_PALETTE, themeColorVar } from '@jaw.id/ui';
import { Card } from './ui/card';
import { JAW_THEME_PRESETS, activePresetLabel } from '../lib/jaw-theme-presets';
import { oklchChannelsToHex } from '../lib/oklch-hex';

type ColorKey = keyof JawThemeColors;

/** Editable tokens, grouped the way a designer thinks about the dialog. */
const COLOR_GROUPS: readonly { label: string; keys: readonly ColorKey[] }[] = [
  { label: 'Surfaces', keys: ['background', 'card', 'popover', 'border', 'input'] },
  { label: 'Text', keys: ['foreground', 'mutedForeground'] },
  { label: 'Brand', keys: ['primary', 'primaryForeground', 'secondary', 'muted', 'accent', 'ring'] },
  { label: 'Status', keys: ['warning', 'success', 'destructive', 'info', 'positive', 'negative'] },
  { label: 'Chrome', keys: ['scrim', 'halo', 'identiconTile', 'identiconRing', 'shadow'] },
];

/** 'cardForeground' → 'card foreground', for input labels. */
const fieldLabel = (key: string) => key.replace(/([A-Z])/g, ' $1').toLowerCase();

/**
 * The hex an <input type="color"> should display for a token: the explicit
 * theme color if set, else the SDK's palette default for the effective mode.
 */
function effectiveHex(key: ColorKey, theme: JawTheme): string {
  const explicit = theme.colors?.[key];
  if (typeof explicit === 'string') return explicit;
  const isDark =
    theme.mode === 'dark' ||
    (theme.mode !== 'light' && typeof document !== 'undefined' && document.documentElement.classList.contains('dark'));
  const palette = isDark ? DEFAULT_DARK_PALETTE : DEFAULT_LIGHT_PALETTE;
  return oklchChannelsToHex(palette[themeColorVar(key)] ?? '') ?? '#000000';
}

const ACCENT_PRESETS = [
  { label: 'Default', value: '' },
  { label: 'Indigo', value: '#6366f1' },
  { label: 'Purple', value: '#7b3fe4' },
  { label: 'Rose', value: '#e11d48' },
  { label: 'Emerald', value: '#059669' },
  { label: 'Orange', value: '#ea580c' },
  { label: 'Sky', value: '#0284c7' },
] as const;

const RADIUS_OPTIONS: JawBorderRadius[] = ['sm', 'md', 'lg'];
const MODE_OPTIONS: JawThemeMode[] = ['light', 'dark', 'auto'];

/**
 * SDK-only theme picker. Mode/accent/radius changes here affect the SDK
 * dialogs only — they DO NOT change the playground's own theme. Use the
 * sun/moon button in the page header for the global playground theme.
 *
 * The picker's mode === 'auto' means "follow the playground" (because the
 * SDK's auto mode reads <html class="dark|light"> set by next-themes).
 */
export function ThemePicker({ theme, onThemeChange }: { theme: JawTheme; onThemeChange: (theme: JawTheme) => void }) {
  const effectiveMode: JawThemeMode = theme.mode ?? 'auto';
  const activePreset = activePresetLabel(theme);
  const [editorOpen, setEditorOpen] = useState(false);
  const [copied, setCopied] = useState(false);

  const setColor = (key: ColorKey, hex: string) => onThemeChange({ ...theme, colors: { ...theme.colors, [key]: hex } });

  const copyTheme = async () => {
    try {
      await navigator.clipboard.writeText(`theme: ${JSON.stringify(theme, null, 2)}`);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // clipboard unavailable (insecure context) — nothing to do
    }
  };

  return (
    <Card className="p-4">
      <h3 className="mb-3 text-sm font-semibold">Theme (SDK Dialogs)</h3>
      <p className="text-muted-foreground mb-3 text-xs">
        These settings affect SDK dialogs only. Use the sun/moon button at the top to change the playground theme. Set
        mode to <code className="bg-muted rounded px-1">auto</code> to follow the playground. Presets re-skin the
        dialogs fully via the semantic <code className="bg-muted rounded px-1">colors</code> palette (plain hex);
        changing mode or accent switches back to a custom theme.
      </p>
      <div className="flex flex-wrap gap-4">
        {/* Full-skin presets (Layer 2: cssVariables) */}
        <div className="flex flex-col gap-1">
          <span className="text-muted-foreground text-xs">Preset</span>
          <div className="flex gap-1">
            <button
              onClick={() => onThemeChange({ mode: 'auto' })}
              className={`rounded px-2 py-1 text-xs transition-colors ${
                !activePreset
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-muted text-muted-foreground hover:bg-muted/80'
              }`}
            >
              Default
            </button>
            {JAW_THEME_PRESETS.map((preset) => (
              <button
                key={preset.label}
                onClick={() => onThemeChange(preset.theme)}
                className={`flex items-center gap-1.5 rounded px-2 py-1 text-xs transition-colors ${
                  activePreset === preset.label
                    ? 'bg-primary text-primary-foreground'
                    : 'bg-muted text-muted-foreground hover:bg-muted/80'
                }`}
              >
                <span
                  className="border-border h-3 w-3 rounded-full border"
                  style={{ backgroundColor: preset.swatch }}
                />
                {preset.label}
              </button>
            ))}
          </div>
        </div>

        {/* Mode */}
        <div className="flex flex-col gap-1">
          <span className="text-muted-foreground text-xs">Mode</span>
          <div className="flex gap-1">
            {MODE_OPTIONS.map((m) => (
              <button
                key={m}
                onClick={() => onThemeChange({ ...theme, colors: undefined, cssVariables: undefined, mode: m })}
                className={`rounded px-2 py-1 text-xs transition-colors ${
                  effectiveMode === m
                    ? 'bg-primary text-primary-foreground'
                    : 'bg-muted text-muted-foreground hover:bg-muted/80'
                }`}
              >
                {m}
              </button>
            ))}
          </div>
        </div>

        {/* Accent Color */}
        <div className="flex flex-col gap-1">
          <span className="text-muted-foreground text-xs">Accent</span>
          <div className="flex items-center gap-1">
            {ACCENT_PRESETS.map((preset) => (
              <button
                key={preset.label}
                onClick={() =>
                  onThemeChange({
                    ...theme,
                    colors: undefined,
                    cssVariables: undefined,
                    accentColor: preset.value || undefined,
                  })
                }
                className={`h-6 w-6 rounded-full border-2 transition-colors ${
                  (theme.accentColor ?? '') === preset.value ? 'border-foreground' : 'border-transparent'
                }`}
                style={{
                  backgroundColor: preset.value || 'var(--primary)',
                }}
                title={preset.label}
              />
            ))}
          </div>
        </div>

        {/* Border Radius */}
        <div className="flex flex-col gap-1">
          <span className="text-muted-foreground text-xs">Radius</span>
          <div className="flex gap-1">
            {RADIUS_OPTIONS.map((r) => (
              <button
                key={r}
                onClick={() => onThemeChange({ ...theme, borderRadius: r })}
                className={`rounded px-2 py-1 text-xs transition-colors ${
                  (theme.borderRadius ?? 'md') === r
                    ? 'bg-primary text-primary-foreground'
                    : 'bg-muted text-muted-foreground hover:bg-muted/80'
                }`}
              >
                {r}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Custom color editor (semantic `colors` palette, plain hex) */}
      <div className="mt-4 border-t pt-3">
        <div className="flex items-center gap-2">
          <button
            onClick={() => setEditorOpen((open) => !open)}
            className="bg-muted text-muted-foreground hover:bg-muted/80 rounded px-2 py-1 text-xs transition-colors"
          >
            {editorOpen ? 'Hide custom colors' : 'Customize colors…'}
          </button>
          {theme.colors && (
            <button
              onClick={() => onThemeChange({ ...theme, colors: undefined })}
              className="bg-muted text-muted-foreground hover:bg-muted/80 rounded px-2 py-1 text-xs transition-colors"
            >
              Reset colors
            </button>
          )}
          <button
            onClick={copyTheme}
            className="bg-muted text-muted-foreground hover:bg-muted/80 ml-auto rounded px-2 py-1 text-xs transition-colors"
          >
            {copied ? 'Copied!' : 'Copy theme'}
          </button>
        </div>

        {editorOpen && (
          <div className="mt-3 flex flex-col gap-3">
            {COLOR_GROUPS.map((group) => (
              <div key={group.label}>
                <span className="text-muted-foreground text-xs font-medium">{group.label}</span>
                <div className="mt-1 grid grid-cols-2 gap-x-4 gap-y-1 sm:grid-cols-3 md:grid-cols-4">
                  {group.keys.map((key) => (
                    <label key={key} className="flex cursor-pointer items-center gap-2">
                      <input
                        type="color"
                        value={effectiveHex(key, theme)}
                        onChange={(e) => setColor(key, e.target.value)}
                        className="h-6 w-8 flex-none cursor-pointer rounded border bg-transparent p-0"
                      />
                      <span
                        className={`truncate text-xs ${theme.colors?.[key] ? 'text-foreground font-medium' : 'text-muted-foreground'}`}
                      >
                        {fieldLabel(key)}
                      </span>
                    </label>
                  ))}
                </div>
              </div>
            ))}
            <p className="text-muted-foreground text-xs">
              Edited tokens are highlighted; untouched ones show the SDK default for the current mode. Changes apply
              live to open dialogs in both modes. Use <em>Copy theme</em> to grab the resulting config.
            </p>
          </div>
        )}
      </div>
    </Card>
  );
}
