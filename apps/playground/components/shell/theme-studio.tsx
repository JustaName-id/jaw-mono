'use client';

import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import Image from 'next/image';
import type { JawTheme, JawThemeMode, JawBorderRadius, JawThemeColors } from '@jaw.id/core';
import {
  DEFAULT_LIGHT_PALETTE,
  DEFAULT_DARK_PALETTE,
  themeColorVar,
  resolveTheme,
  applyThemeToContainer,
  useColorScheme,
} from '@jaw.id/ui';
import { JAW_THEME_PRESETS, activePresetLabel } from '../../lib/jaw-theme-presets';
import { oklchChannelsToHex } from '../../lib/oklch-hex';

type ColorKey = keyof JawThemeColors;

/** The studio's quick-edit tokens (the full palette still comes via presets). */
const SWATCH_KEYS: readonly ColorKey[] = [
  'background',
  'foreground',
  'mutedForeground',
  'border',
  'primary',
  'destructive',
];

/** 'mutedForeground' → 'muted foreground', for row labels. */
const fieldLabel = (key: string) => key.replace(/([A-Z])/g, ' $1').toLowerCase();

// Same accent list the previous picker offered — the values are part of the
// theme API surface builders copy.
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
 * The hex a swatch should display for a token: the explicit theme color if
 * set, else the SDK's palette default for the effective mode. (Same rule the
 * previous ThemePicker used.)
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

function pillClass(active: boolean): string {
  return `cursor-pointer rounded-full border px-[13px] py-[7px] text-[12.5px] font-medium transition-colors ${
    active
      ? 'bg-shell-active border-shell-line-2 text-shell-ink'
      : 'border-shell-line-2 bg-transparent text-shell-ink-3 hover:text-shell-ink-2'
  }`;
}

function ControlRow({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-[9px]">
      <div>
        <div className="text-shell-ink-2 text-[13.5px] font-medium">{label}</div>
        {hint && <div className="text-shell-ink-3 mt-[3px] text-[13px]">{hint}</div>}
      </div>
      <div role="group" aria-label={label} className="flex flex-wrap gap-1.5">
        {children}
      </div>
    </div>
  );
}

/**
 * Sidebar controls for the SDK dialog theme. Produces the exact same JawTheme
 * objects the previous ThemePicker did — mode/accent changes clear the colors
 * palette, presets replace the whole theme, color edits merge one key.
 */
export function ThemeStudioControls({
  theme,
  onThemeChange,
}: {
  theme: JawTheme;
  onThemeChange: (theme: JawTheme) => void;
}) {
  const effectiveMode: JawThemeMode = theme.mode ?? 'auto';
  const activePreset = activePresetLabel(theme);
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
    <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-3.5 pb-6 pt-0.5">
      <p className="text-shell-ink-3 m-0 text-[13px] leading-relaxed">
        Tokens apply to SDK dialogs only. The playground chrome is independent — set mode to{' '}
        <span className="font-mono text-[12px]">auto</span> to follow it.
      </p>

      <ControlRow label="Preset" hint="Full re-skin">
        <button type="button" onClick={() => onThemeChange({ mode: 'auto' })} className={pillClass(!activePreset)}>
          Default
        </button>
        {JAW_THEME_PRESETS.map((preset) => (
          <button
            key={preset.label}
            type="button"
            onClick={() => onThemeChange(preset.theme)}
            className={`${pillClass(activePreset === preset.label)} inline-flex items-center gap-1.5`}
          >
            <span
              className="border-shell-line-2 h-3 w-3 rounded-full border"
              style={{ backgroundColor: preset.swatch }}
            />
            {preset.label}
          </button>
        ))}
      </ControlRow>

      <ControlRow label="Mode" hint="auto follows the playground">
        {MODE_OPTIONS.map((m) => (
          <button
            key={m}
            type="button"
            onClick={() => onThemeChange({ ...theme, colors: undefined, cssVariables: undefined, mode: m })}
            className={pillClass(effectiveMode === m)}
          >
            {m}
          </button>
        ))}
      </ControlRow>

      <ControlRow label="Accent" hint="Primary action color">
        {ACCENT_PRESETS.map((preset) => (
          <button
            key={preset.label}
            type="button"
            title={preset.label}
            onClick={() =>
              onThemeChange({
                ...theme,
                colors: undefined,
                cssVariables: undefined,
                accentColor: preset.value || undefined,
              })
            }
            className={`h-[26px] w-[26px] cursor-pointer rounded-full border transition-transform ${
              (theme.accentColor ?? '') === preset.value ? 'border-shell-ink scale-110 border-2' : 'border-shell-line-2'
            }`}
            style={{ backgroundColor: preset.value || 'var(--shell-btn)' }}
          />
        ))}
      </ControlRow>

      <ControlRow label="Radius" hint="Corner scale">
        {RADIUS_OPTIONS.map((r) => (
          <button
            key={r}
            type="button"
            onClick={() => onThemeChange({ ...theme, borderRadius: r })}
            className={pillClass((theme.borderRadius ?? 'md') === r)}
          >
            {r}
          </button>
        ))}
      </ControlRow>

      <div className="bg-shell-line h-px" />

      <div className="flex flex-col gap-[9px]">
        <div className="flex items-baseline justify-between gap-2.5">
          <div className="text-shell-ink-2 text-[13.5px] font-medium">Semantic colors</div>
          <span className={`text-[13px] ${theme.colors ? 'text-shell-warn' : 'text-shell-ink-4'}`}>
            {activePreset ? `${activePreset} preset` : theme.colors ? 'Custom theme' : 'Defaults'}
          </span>
        </div>
        <div className="flex flex-col gap-1.5">
          {SWATCH_KEYS.map((key) => (
            <label
              key={key}
              className="border-shell-line bg-shell-raise flex cursor-pointer items-center gap-[9px] rounded-[10px] border px-2.5 py-[7px]"
            >
              <input
                type="color"
                value={effectiveHex(key, theme)}
                onChange={(e) => setColor(key, e.target.value)}
                aria-label={`${fieldLabel(key)} color`}
                className="border-shell-line-2 h-5 w-5 flex-none cursor-pointer rounded-md border bg-transparent p-0"
              />
              <span className="text-shell-ink-3 flex-1 text-[13px]">{fieldLabel(key)}</span>
              <span
                className={`font-mono text-[12.5px] ${theme.colors?.[key] ? 'text-shell-ink' : 'text-shell-ink-4'}`}
              >
                {effectiveHex(key, theme)}
              </span>
            </label>
          ))}
        </div>
      </div>

      <div className="flex items-center gap-2">
        {theme.colors && (
          <button
            type="button"
            onClick={() => onThemeChange({ ...theme, colors: undefined })}
            className="border-shell-line-2 text-shell-ink-3 hover:text-shell-ink cursor-pointer rounded-full border bg-transparent px-3.5 py-[9px] text-[13px] transition-colors"
          >
            Reset colors
          </button>
        )}
        <button
          type="button"
          onClick={copyTheme}
          className="border-shell-line-2 text-shell-ink flex-1 cursor-pointer rounded-full border bg-transparent px-3.5 py-[9px] text-[13px] transition-colors"
        >
          {copied ? 'Copied' : 'Copy theme'}
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Dialog previews — faithful replicas of the real SDK dialogs (DialogShell
// anatomy, type scale and button pattern from @jaw.id/ui), themed through the
// REAL pipeline: resolveTheme → applyThemeToContainer → --jaw-* variables.
// ---------------------------------------------------------------------------

/** oklch(var(--jaw-color-<name>)) reference for replica inline styles. */
const jaw = (name: string, alpha?: number) =>
  alpha !== undefined ? `oklch(var(--jaw-color-${name}) / ${alpha})` : `oklch(var(--jaw-color-${name}))`;

/** Container that runs the SDK's own theme resolution on its DOM node. */
function ThemedFrame({ theme, children }: { theme: JawTheme; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const systemScheme = useColorScheme();

  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    // Same resolution the SDK runs for a live dialog: theme.mode 'auto'
    // follows the playground's own <html class="dark"> (like the dialogs do).
    const apply = () => {
      const hostScheme = document.documentElement.classList.contains('dark') ? 'dark' : 'light';
      applyThemeToContainer(
        node,
        resolveTheme(theme, theme.mode === 'auto' || !theme.mode ? hostScheme : systemScheme)
      );
    };
    apply();
    const observer = new MutationObserver(apply);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
    return () => observer.disconnect();
  }, [theme, systemScheme]);

  return (
    <div ref={ref} className="flex justify-center">
      {children}
    </div>
  );
}

/** DialogShell replica: 1.5px border ring, 400px popover surface, close X. */
function ShellReplica({ children }: { children: ReactNode }) {
  return (
    <div className="relative w-full max-w-[400px] p-[1.5px]" style={{ background: jaw('border'), borderRadius: 16.5 }}>
      <div
        className="relative flex min-h-[234px] flex-col overflow-hidden shadow-xl"
        style={{
          background: jaw('popover'),
          color: jaw('popover-foreground'),
          border: `1px solid ${jaw('border')}`,
          borderRadius: 16.5,
        }}
      >
        {children}
      </div>
      <span
        aria-hidden="true"
        className="absolute right-5 top-6 z-[2] flex h-7 w-7 items-center justify-center rounded-full"
        style={{ background: jaw('secondary'), border: `1px solid ${jaw('border')}`, color: jaw('muted-foreground') }}
      >
        <svg
          width="12"
          height="12"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={2.2}
          strokeLinecap="round"
        >
          <path d="M6 6l12 12M18 6L6 18" />
        </svg>
      </span>
    </div>
  );
}

const titleXl: CSSProperties = { fontSize: 26, lineHeight: 1.2, fontWeight: 700, letterSpacing: '-0.03em' };
const monoLabel: CSSProperties = {
  fontFamily: 'var(--font-mono), ui-monospace, monospace',
  fontSize: 11,
  fontWeight: 500,
  letterSpacing: '0.08em',
  textTransform: 'uppercase',
};
const buttonBase: CSSProperties = {
  height: 40,
  fontSize: 13,
  fontWeight: 600,
  borderRadius: 'var(--jaw-radius)',
  border: 0,
  cursor: 'default',
};

function FooterButtons({
  cancel,
  confirm,
  destructive = false,
}: {
  cancel: string;
  confirm: string;
  destructive?: boolean;
}) {
  return (
    <div className="flex gap-2 px-6 pb-5 pt-3" style={{ borderTop: `1px solid ${jaw('border', 0.4)}` }}>
      <span
        className="flex items-center justify-center"
        style={{ ...buttonBase, flex: 44, background: jaw('secondary'), color: jaw('secondary-foreground') }}
      >
        {cancel}
      </span>
      <span
        className="flex items-center justify-center"
        style={{
          ...buttonBase,
          flex: 56,
          background: destructive ? jaw('destructive') : jaw('primary'),
          color: destructive ? jaw('destructive-foreground') : jaw('primary-foreground'),
        }}
      >
        {confirm}
      </span>
    </div>
  );
}

function FeeRow({ value }: { value: string }) {
  return (
    <div className="flex items-center justify-between px-6 py-2.5">
      <span style={{ ...monoLabel, color: jaw('muted-foreground') }}>Network fee</span>
      <span className="text-[13px] font-medium">{value}</span>
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div
      className="flex items-center justify-between gap-3 py-2"
      style={{ borderTop: `1px solid ${jaw('border', 0.4)}` }}
    >
      <span style={{ ...monoLabel, color: jaw('muted-foreground') }}>{label}</span>
      <span className="truncate text-[13px] font-medium">{value}</span>
    </div>
  );
}

function WelcomeBackPreview() {
  return (
    <ShellReplica>
      <div className="flex flex-1 flex-col p-6">
        <h2 style={titleXl}>Welcome back.</h2>
        <p className="mt-2 text-sm" style={{ color: jaw('muted-foreground') }}>
          Pick up where you left off.
        </p>
        <div
          className="mt-6 flex items-center gap-3 p-3"
          style={{ background: jaw('primary'), color: jaw('primary-foreground'), borderRadius: 12 }}
        >
          <span
            className="flex h-10 w-10 flex-none items-center justify-center"
            style={{ background: `oklch(var(--jaw-color-primary-foreground) / 0.1)`, borderRadius: 12 }}
          >
            <Image src="/jaw-logo.png" alt="" width={18} height={20} className="opacity-80" />
          </span>
          <span className="flex min-w-0 flex-col gap-1">
            <span style={{ ...monoLabel, color: jaw('primary-foreground', 0.6) }}>Last used</span>
            <span className="truncate text-sm font-semibold">leo.jaw.id</span>
          </span>
        </div>
        <div className="mt-auto flex items-center gap-3 pt-5">
          <span className="h-px flex-1" style={{ background: jaw('border') }} />
          <span style={{ ...monoLabel, color: jaw('muted-foreground') }}>New to JAW?</span>
          <span className="h-px flex-1" style={{ background: jaw('border') }} />
        </div>
        <span
          className="mt-4 flex items-center justify-center"
          style={{ ...buttonBase, background: jaw('secondary'), color: jaw('secondary-foreground') }}
        >
          Create new account
        </span>
      </div>
    </ShellReplica>
  );
}

function SendingPreview() {
  return (
    <ShellReplica>
      <div className="flex flex-1 flex-col">
        <div className="p-6 pb-3">
          <h2 style={titleXl}>You&rsquo;re Sending</h2>
          <div className="mt-5 text-[34px] font-bold tracking-[-0.03em]">0.01 ETH</div>
          <div className="text-sm" style={{ color: jaw('muted-foreground') }}>
            ≈ $24.10
          </div>
        </div>
        <div className="mt-auto px-6 pb-2">
          <InfoRow label="To" value="vitalik.eth" />
          <InfoRow label="Network" value="Base Sepolia" />
        </div>
        <FeeRow value="~0.0002 ETH" />
        <FooterButtons cancel="Cancel" confirm="Confirm" />
      </div>
    </ShellReplica>
  );
}

function PermissionPreview() {
  return (
    <ShellReplica>
      <div className="flex flex-1 flex-col">
        <div className="p-6 pb-3">
          <h2 style={{ ...titleXl, fontSize: 24 }}>Requesting Permission</h2>
          <p className="mt-2 text-sm" style={{ color: jaw('muted-foreground') }}>
            playground.jaw.id wants to spend within these limits without asking again.
          </p>
        </div>
        <div className="mt-auto px-6 pb-2">
          <InfoRow label="Spender" value="0x1f9A…C4e2" />
          <InfoRow label="Spend limit" value="0.1 ETH / day" />
          <InfoRow label="Expiry" value="24 hours" />
        </div>
        <FeeRow value="Sponsored" />
        <FooterButtons cancel="Cancel" confirm="Grant" />
      </div>
    </ShellReplica>
  );
}

const PREVIEWS = [
  { name: 'eth_requestAccounts', kind: 'Sign in', node: <WelcomeBackPreview /> },
  { name: 'eth_sendTransaction', kind: 'Transaction', node: <SendingPreview /> },
  { name: 'wallet_grantPermissions', kind: 'Permission', node: <PermissionPreview /> },
];

/** Main-pane preview grid + the theme.json block. */
export function DialogPreviews({ theme }: { theme: JawTheme }) {
  const preset = activePresetLabel(theme);
  const previewMeta = `${preset ?? (theme.colors ? 'Custom' : 'Default')} · ${theme.mode ?? 'auto'} · ${theme.borderRadius ?? 'md'}`;

  return (
    <div className="flex flex-col gap-[22px]">
      <div className="flex flex-wrap items-end justify-between gap-5">
        <div>
          <h1 className="m-0 text-[30px] font-medium tracking-[-0.035em]">Dialog previews</h1>
          <p className="text-shell-ink-3 mt-2.5 max-w-[70ch] text-[14.5px] leading-relaxed">
            The three core dialogs, rendered with the tokens on the left through the SDK&rsquo;s own theme resolution.
            Changes apply here as you make them.
          </p>
        </div>
        <span className="text-shell-ink-3 whitespace-nowrap text-[13px]">{previewMeta}</span>
      </div>

      <div className="grid grid-cols-[repeat(auto-fill,minmax(min(345px,100%),1fr))] gap-6">
        {PREVIEWS.map((preview) => (
          <div key={preview.name} className="flex min-w-0 flex-col gap-[11px]">
            <div className="flex min-w-0 items-baseline gap-[9px]">
              <span className="text-shell-ink break-words font-mono text-[12.5px] font-semibold">{preview.name}</span>
              <span className="text-shell-ink-3 whitespace-nowrap text-[13px]">{preview.kind}</span>
            </div>
            <ThemedFrame theme={theme}>{preview.node}</ThemedFrame>
          </div>
        ))}
      </div>

      <div className="mt-1 flex flex-col gap-2.5">
        <span className="text-shell-ink-3 font-mono text-[11px] uppercase tracking-[0.14em]">theme.json</span>
        <pre className="border-shell-line bg-shell-code text-shell-code-ink m-0 overflow-x-auto rounded-[14px] border px-5 py-[18px] font-mono text-[13px] leading-[1.7]">
          {JSON.stringify(theme, null, 2)}
        </pre>
      </div>
    </div>
  );
}
