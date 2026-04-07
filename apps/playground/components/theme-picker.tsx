'use client';

import type { JawTheme, JawThemeMode, JawBorderRadius } from '@jaw.id/core';
import { Card } from './ui/card';

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

  return (
    <Card className="p-4">
      <h3 className="mb-3 text-sm font-semibold">Theme (SDK Dialogs)</h3>
      <p className="text-muted-foreground mb-3 text-xs">
        These settings affect SDK dialogs only. Use the sun/moon button at the top to change the playground theme. Set
        mode to <code className="bg-muted rounded px-1">auto</code> to follow the playground.
      </p>
      <div className="flex flex-wrap gap-4">
        {/* Mode */}
        <div className="flex flex-col gap-1">
          <span className="text-muted-foreground text-xs">Mode</span>
          <div className="flex gap-1">
            {MODE_OPTIONS.map((m) => (
              <button
                key={m}
                onClick={() => onThemeChange({ ...theme, mode: m })}
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
    </Card>
  );
}
