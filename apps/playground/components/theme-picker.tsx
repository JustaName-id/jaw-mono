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

export function ThemePicker({
  theme,
  onThemeChange,
}: {
  theme: JawTheme;
  onThemeChange: (theme: JawTheme) => void;
}) {
  return (
    <Card className="p-4">
      <h3 className="text-sm font-semibold mb-3">Theme (SDK Dialogs)</h3>
      <div className="flex flex-wrap gap-4">
        {/* Mode */}
        <div className="flex flex-col gap-1">
          <span className="text-xs text-muted-foreground">Mode</span>
          <div className="flex gap-1">
            {MODE_OPTIONS.map((m) => (
              <button
                key={m}
                onClick={() => onThemeChange({ ...theme, mode: m })}
                className={`px-2 py-1 text-xs rounded transition-colors ${
                  (theme.mode ?? 'auto') === m
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
          <span className="text-xs text-muted-foreground">Accent</span>
          <div className="flex gap-1 items-center">
            {ACCENT_PRESETS.map((preset) => (
              <button
                key={preset.label}
                onClick={() =>
                  onThemeChange({
                    ...theme,
                    accentColor: preset.value || undefined,
                  })
                }
                className={`w-6 h-6 rounded-full border-2 transition-colors ${
                  (theme.accentColor ?? '') === preset.value
                    ? 'border-foreground'
                    : 'border-transparent'
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
          <span className="text-xs text-muted-foreground">Radius</span>
          <div className="flex gap-1">
            {RADIUS_OPTIONS.map((r) => (
              <button
                key={r}
                onClick={() => onThemeChange({ ...theme, borderRadius: r })}
                className={`px-2 py-1 text-xs rounded transition-colors ${
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
