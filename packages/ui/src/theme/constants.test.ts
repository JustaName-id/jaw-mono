// The palette is declared twice, and it has to be:
//
//   styles.css   `:root` / `.dark`     — used when a host renders our components in its own tree
//                                        (keys' EmbeddedShell), where nothing calls applyThemeToContainer
//   constants.ts DEFAULT_PALETTE       — written as *inline styles* onto the SDK container in
//                DEFAULT_DARK_PALETTE    app-specific mode, so a consumer can override a theme
//
// Inline styles outrank the stylesheet, so when the two disagree the dialogs render one palette
// under the SDK and a different one under keys. That is exactly what happened once: the design
// spec's ink was applied to styles.css only, and app-specific mode silently kept the old greys.
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { DEFAULT_DARK_PALETTE, DEFAULT_LIGHT_PALETTE } from './constants';

/** Every `--jaw-color-*` declaration in a CSS block. */
function cssVars(block: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [, name, value] of block.matchAll(/(--jaw-color-[a-z0-9-]+):\s*([^;]+);/g)) {
    out[name] = value.trim();
  }
  return out;
}

/**
 * Compare colours, not spelling. `oklch(0.92 0.15 80)` and `oklch(0.920 0.150 80)` are the same
 * colour; a test that fails on trailing zeros teaches people to stop trusting it.
 */
function sameColor(a: string, b: string): boolean {
  const nums = (s: string) => (s.match(/-?\d*\.?\d+/g) ?? []).map(Number);
  const [x, y] = [nums(a), nums(b)];
  if (x.length !== y.length || x.length === 0) return a.trim() === b.trim();
  return x.every((n, i) => Math.abs(n - y[i]) < 0.0005);
}

const css = readFileSync(join(__dirname, '../styles.css'), 'utf8');
const rootBlock = css.slice(css.indexOf(':root'), css.indexOf('.dark'));
const darkBlock = css.slice(css.indexOf('.dark'));

describe('palette declarations agree', () => {
  it.each([
    ['light', DEFAULT_LIGHT_PALETTE, cssVars(rootBlock)],
    ['dark', DEFAULT_DARK_PALETTE, cssVars(darkBlock)],
  ])('%s: every token in styles.css matches the inline default', (_mode, constants, fromCss) => {
    const mismatches = Object.entries(fromCss)
      .filter(([name, cssValue]) => {
        const constant = (constants as Record<string, string>)[name];
        return constant !== undefined && !sameColor(cssValue, constant);
      })
      .map(([name, cssValue]) => `${name}: css=${cssValue} constants=${(constants as Record<string, string>)[name]}`);
    expect(mismatches).toEqual([]);
  });

  // Values are oklch *channels*, not `oklch(...)` strings: the Tailwind theme wraps them as
  // `oklch(var(--x) / <alpha-value>)` so opacity modifiers (`bg-primary/90`, `text-…/60`) generate
  // CSS at all. Stored as a complete colour, every one of the package's 80 `/alpha` utilities
  // emitted nothing and the text silently inherited its parent.
  //
  // Deliberately NOT the design spec's ink (#0A1020 / #F5F5F4 / #C7CEDA / #8A94A6). The dialogs
  // are pinned to shadcn's slate, which is what keys was lending them before the package became
  // self-contained — reviewed on screen and preferred. Revisit with the designer; until then these
  // assertions are the record of the decision, so a future "let's follow the spec" edit is a
  // conscious change rather than a silent one.
  it.each([
    ['--jaw-color-card', '0.1363 0.0364 259.201', '#020817 surface'],
    ['--jaw-color-foreground', '0.9842 0.0034 247.858', '#F8FAFC primary text'],
    ['--jaw-color-muted-foreground', '0.7107 0.0351 256.788', '#94A3B8 muted'],
    ['--jaw-color-border', '0.2795 0.0368 260.031', '#1E293B border'],
  ])('dark %s is the chosen slate value (%s → %s)', (token, expected) => {
    expect(DEFAULT_DARK_PALETTE[token]).toBe(expected);
  });

  // Slate has no middle tier: secondary equals primary, so anything using `secondary-foreground`
  // renders at full white. That is how the screens looked when this palette was chosen, and it is
  // recorded here rather than left as an accident — the spec's #C7CEDA is the fix if the flatness
  // ever becomes a problem.
  it('secondary intentionally matches primary text under slate', () => {
    expect(DEFAULT_DARK_PALETTE['--jaw-color-secondary-foreground']).toBe(
      DEFAULT_DARK_PALETTE['--jaw-color-foreground']
    );
  });
});
