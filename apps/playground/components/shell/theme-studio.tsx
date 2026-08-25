'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { ArrowDown, ArrowUp, ChevronDown, ChevronRight, FileCode2 } from 'lucide-react';
import type { JawTheme, JawThemeMode, JawBorderRadius, JawFontStack, JawThemeColors } from '@jaw.id/core';
import {
  DEFAULT_LIGHT_PALETTE,
  DEFAULT_DARK_PALETTE,
  themeColorVar,
  DialogShell,
  AccountAvatar,
  resolveTheme,
  applyThemeToContainer,
  useColorScheme,
} from '@jaw.id/ui';
import { JAW_THEME_PRESETS, activePresetLabel } from '../../lib/jaw-theme-presets';
import { oklchChannelsToHex } from '../../lib/oklch-hex';

type ColorKey = keyof JawThemeColors;

/**
 * Every token in JawThemeColors, grouped so 33 swatches stay navigable. The
 * groups are presentational only — each key is written straight into
 * `theme.colors`, which is the modular hex API the SDK documents.
 */
const COLOR_GROUPS: readonly { label: string; keys: readonly ColorKey[] }[] = [
  { label: 'Surfaces', keys: ['background', 'card', 'popover', 'secondary', 'muted', 'accent', 'input'] },
  {
    label: 'Text',
    keys: [
      'foreground',
      'cardForeground',
      'popoverForeground',
      'secondaryForeground',
      'mutedForeground',
      'accentForeground',
    ],
  },
  { label: 'Brand', keys: ['primary', 'primaryForeground'] },
  {
    label: 'Status',
    keys: [
      'destructive',
      'destructiveForeground',
      'destructiveHover',
      'success',
      'successForeground',
      'warning',
      'warningForeground',
      'info',
      'infoForeground',
      'positive',
      'negative',
    ],
  },
  { label: 'Detail', keys: ['border', 'ring', 'scrim', 'halo', 'identiconTile', 'identiconRing', 'shadow'] },
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
const FONT_OPTIONS: JawFontStack[] = ['system', 'rounded', 'mono'];
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
  onSave,
  dirty,
}: {
  theme: JawTheme;
  onThemeChange: (theme: JawTheme) => void;
  /** Commits the draft to the SDK — until then edits only move the mock previews. */
  onSave: () => void;
  dirty: boolean;
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

      <ControlRow label="Font" hint="Dialog type stack">
        {FONT_OPTIONS.map((f) => (
          <button
            key={f}
            type="button"
            onClick={() => onThemeChange({ ...theme, fontStack: f })}
            className={pillClass((theme.fontStack ?? 'system') === f)}
          >
            {f}
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
        <div className="flex flex-col gap-2">
          {COLOR_GROUPS.map((group, i) => (
            <details key={group.label} open={i === 0} className="group">
              <summary className="text-shell-ink-3 hover:text-shell-ink-2 flex cursor-pointer list-none items-center gap-1.5 py-1 text-[12.5px] font-medium">
                <span className="transition-transform group-open:rotate-90">&rsaquo;</span>
                {group.label}
                <span className="text-shell-ink-4">{group.keys.length}</span>
              </summary>
              <div className="mt-1 flex flex-col gap-1.5">
                {group.keys.map((key) => (
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
            </details>
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

      {/* Save commits the draft to the SDK (uiHandler.setTheme + provider.setTheme).
          Until then the edits above only move the mock previews. */}
      <button
        type="button"
        onClick={onSave}
        disabled={!dirty}
        // bg-shell-btn / text-shell-btn-ink is the shell's primary-button pair (see
        // encode-panel, execute-panel). Not bg-shell-ink: that is a TEXT token and
        // inverts per mode, so in dark it painted a white button whose label
        // inherited the same white.
        className={`sticky bottom-0 rounded-full px-3.5 py-[11px] text-[13.5px] font-semibold transition-colors ${
          dirty
            ? 'bg-shell-btn text-shell-btn-ink cursor-pointer border-0'
            : 'border-shell-line-2 text-shell-ink-4 cursor-default border bg-transparent'
        }`}
      >
        {dirty ? 'Save theme' : 'Saved'}
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Dialog previews — the REAL SDK dialogs, not replicas. The shell is the
// exported DialogShell from @jaw.id/ui and every inner element carries the same
// classes the real ConnectDialog / TransactionDialog / PermissionDialog emit, so
// these cannot drift from what ships in the iframe.
//
// Two things make that possible and are easy to break:
//   1. `data-jaw-ui` on the container. Every utility @jaw.id/ui ships compiles to
//      `[data-jaw-ui] .foo` (see ReactUIHandler), so without this wrapper none of
//      the classes below resolve and the cards render unstyled.
//   2. The stylesheet itself arrives as a side-effect of importing @jaw.id/ui
//      (packages/ui/src/index.ts does `import './styles.css'`), which this file
//      already does — there is nothing extra to import.
// ---------------------------------------------------------------------------

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

  // data-jaw-ui: see note (1) above — the package's utilities are scoped to it.
  // aria-hidden + inert: these cards are a visual specimen of the dialogs, not
  // operable UI. Without it every preview donates a focusable "Cancel" button
  // (DialogShell's close X) that does nothing.
  return (
    <div ref={ref} data-jaw-ui aria-hidden inert className="flex justify-center">
      {children}
    </div>
  );
}

/**
 * The shell renders its close X only when given a handler, and every real dialog
 * passes one — so the previews do too, to keep the card identical. It is a real
 * <button aria-label="Cancel">, so the frame below marks the whole preview
 * inert: decorative here, and a focusable no-op control would otherwise land in
 * the tab order and be announced to screen readers.
 */
const noop = () => undefined;

/** USDC mark, inlined — the live dialog fetches this from the token-icon API. */
function UsdcLogo({ className }: { className: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-label="USDC">
      <circle cx="12" cy="12" r="12" fill="#2775CA" />
      <path d="M9.2 3.9a8.6 8.6 0 0 0 0 16.2" fill="none" stroke="#fff" strokeWidth="1.7" strokeLinecap="round" />
      <path d="M14.8 3.9a8.6 8.6 0 0 1 0 16.2" fill="none" stroke="#fff" strokeWidth="1.7" strokeLinecap="round" />
      <path
        d="M14.6 9.2c-.2-1.1-1.1-1.8-2.6-1.8-1.6 0-2.6.8-2.6 2 0 3 5.4 1.4 5.4 4.5 0 1.3-1.1 2.1-2.8 2.1-1.6 0-2.6-.8-2.8-2"
        fill="none"
        stroke="#fff"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
      <path d="M12 5.4v1.9M12 16.6v1.9" stroke="#fff" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

/** Stable seeds so each preview's identicon is deterministic, like a real account's. */
const SEED_FROM = '0x3c8a0000000000000000000000000000000091f0';
const USDC_ADDRESS = '0x833589fcd6edb6e08f4c7c32d4f71b54bda02913';

/** The real dialogs' mono field label. */
function FieldLabel({ children }: { children: ReactNode }) {
  return <span className="text-muted-foreground text-label block font-mono uppercase">{children}</span>;
}

/** PartyRow: avatar + mono label + truncated address, as TransactionDialog renders it. */
function PartyRow({ label, value, seed }: { label: string; value: string; seed: string }) {
  return (
    <div className="flex min-w-0 items-center gap-3">
      <span className="relative inline-flex flex-none">
        <AccountAvatar seed={seed} size={32} className="size-8 rounded-full" />
      </span>
      <div className="min-w-0 flex-1">
        <FieldLabel>{label}</FieldLabel>
        <div className="mt-1 flex min-w-0 items-center gap-1.5">
          <p className="text-foreground text-value truncate font-mono">{value}</p>
        </div>
      </div>
    </div>
  );
}

// Button's cva base, merged with what the dialogs pass. Spelled out rather than
// importing Button so the preview stays inert — twMerge resolves these exactly
// as the real component does (rounded-box over rounded-md, text-button over
// text-sm, font-semibold over font-medium).
const btnBase =
  'inline-flex items-center justify-center gap-2 whitespace-nowrap transition-colors rounded-box text-button font-semibold shadow-sm';

/** The pinned Cancel/Confirm pair — 44/56 split, exactly as the real footers. */
function Actions({ cancel, confirm }: { cancel: string; confirm: string }) {
  return (
    <div className="flex gap-2">
      <span className={`${btnBase} bg-secondary text-secondary-foreground h-10 flex-[44]`}>{cancel}</span>
      <span className={`${btnBase} bg-primary text-primary-foreground h-10 flex-[56]`}>{confirm}</span>
    </div>
  );
}

/** OnboardingDialog's welcome-back view (eth_requestAccounts). */
function WelcomeBackPreview() {
  return (
    <DialogShell onClose={noop}>
      <div className="flex flex-col p-6">
        <h2 className="text-foreground text-title-xl leading-none">Welcome back.</h2>
        <p className="text-muted-foreground text-body mt-2">Pick up where you left off.</p>

        <div className="bg-primary rounded-box mt-6 flex items-center gap-3 p-3 text-left">
          <AccountAvatar seed={SEED_FROM} size={40} className="rounded-box h-10 w-10 flex-none" />
          <span className="flex min-w-0 flex-1 flex-col gap-1">
            <span className="text-primary-foreground/60 text-label font-mono uppercase">Last used</span>
            <span className="text-primary-foreground truncate text-[15px] font-semibold">leo.jaw.id</span>
          </span>
          <ChevronRight className="text-primary-foreground/70 h-4 w-4 flex-none" />
        </div>

        {/* MonoDivider — local to OnboardingDialog, so its markup is mirrored here. */}
        <div className="my-5 flex items-center gap-3">
          <span className="bg-border h-px flex-1" />
          <span className="text-muted-foreground text-label font-mono uppercase">or</span>
          <span className="bg-border h-px flex-1" />
        </div>

        <span className={`${btnBase} bg-secondary text-secondary-foreground h-11 w-full`}>Show more accounts</span>
        <span className="text-muted-foreground mx-auto mt-4 text-xs font-medium">Create new account</span>
      </div>
    </DialogShell>
  );
}

/** TransactionDialog, ERC-20 transfer shape (eth_sendTransaction). */
function SendingPreview() {
  return (
    <DialogShell onClose={noop} contentClassName="min-h-[510px]">
      <div className="flex min-h-0 flex-1 flex-col">
        <div className="flex-none px-6 pt-6">
          <h2 className="text-foreground text-title-xl truncate pr-9">Review Transaction</h2>
        </div>

        <div className="jaw-scroll min-h-0 flex-1 space-y-3 overflow-y-auto px-6 pb-3 pt-6">
          {/* From -> To. The recipient of an ERC-20 transfer is the token contract. */}
          <div className="border-border rounded-box flex flex-col gap-3 border p-3">
            <PartyRow label="From" value="0x3c8a...91f0" seed={SEED_FROM} />
            <div className="flex items-center">
              <div className="bg-border h-px flex-1" />
              <ArrowDown className="text-muted-foreground mx-1.5 size-3 flex-none" strokeWidth={2} />
              <div className="bg-border h-px flex-1" />
            </div>
            <PartyRow label="To" value="0x8335...2913" seed={USDC_ADDRESS} />
          </div>

          {/* Asset changes — the simulated balance delta. */}
          <div className="flex items-stretch gap-3">
            <div className="border-border rounded-box min-w-0 flex-1 overflow-hidden border">
              <div className="border-border/40 bg-secondary/40 flex items-center gap-2 border-b p-3">
                <ArrowUp className="text-negative size-3 flex-none" strokeWidth={2.7} />
                <span className="text-foreground text-heading">You send</span>
              </div>
              <div className="flex flex-col gap-3 p-2">
                <div className="flex min-h-[34px] flex-row items-center gap-1.5">
                  <UsdcLogo className="size-token flex-none rounded-full" />
                  <div className="flex min-w-0 flex-1 flex-col">
                    <span className="text-foreground text-symbol truncate">USDC</span>
                    <span className="text-muted-foreground text-body-xs flex min-w-0 flex-row items-center gap-1 font-mono">
                      <span className="truncate">0x8335...2913</span>
                    </span>
                  </div>
                  <div className="flex flex-none flex-col items-end">
                    <span className="text-value text-negative break-all text-right font-mono">&minus;25</span>
                    <span className="text-muted-foreground text-body-xs">$25.00</span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Decoded calldata row (collapsed, as the dialog opens it). */}
          <div className="border-border rounded-box overflow-hidden border">
            <div className="flex items-center gap-3 p-3">
              <span className="border-border bg-secondary rounded-chip flex size-7 flex-none items-center justify-center border">
                <FileCode2 className="text-secondary-foreground size-3.5" strokeWidth={1.5} />
              </span>
              <span className="flex min-w-0 flex-col items-start">
                <FieldLabel>Calldata</FieldLabel>
                <span className="text-foreground text-value mt-1 truncate">transfer(address, uint256)</span>
              </span>
              <ChevronDown className="text-muted-foreground ml-auto size-4 flex-none" strokeWidth={2} />
            </div>
          </div>
        </div>

        <div className="border-border/40 flex-none space-y-2 border-t px-6 pb-5 pt-3">
          <div className="border-border rounded-box border p-3">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <FieldLabel>Network fee</FieldLabel>
                <div className="mt-1">
                  <p className="font-mono leading-tight">
                    <span className="text-foreground text-amount">0.0004 ETH</span>
                  </p>
                </div>
              </div>
              <div className="flex flex-none flex-col items-end gap-1.5">
                <div className="text-muted-foreground text-body-xs flex items-center gap-1 font-mono">
                  <span className="truncate">Base Sepolia</span>
                </div>
              </div>
            </div>
          </div>
          <Actions cancel="Cancel" confirm="Confirm" />
        </div>
      </div>
    </DialogShell>
  );
}

const PREVIEWS = [
  { name: 'eth_requestAccounts', kind: 'Sign in', node: <WelcomeBackPreview /> },
  { name: 'eth_sendTransaction', kind: 'Transaction', node: <SendingPreview /> },
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
            These are mocks, rendered with the tokens on the left through the SDK&rsquo;s own theme resolution. Save,
            then try the real dialogs in the methods below.
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
