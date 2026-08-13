// Everything this module returns lands in a `--jaw-color-*` variable, and the Tailwind theme wraps
// those as `oklch(var(--x) / <alpha-value>)`. So a complete `oklch(...)` colour from here nests to
// `oklch(oklch(...) / 1)`, which browsers drop — the utility silently produces nothing and the
// element inherits its parent's colour.
//
// That is exactly what happened to the auto-contrast branch of `deriveAccentPalette`: a consumer
// passing `accentColor` without `accentColorForeground` got a primary button whose label was
// invisible on a dark accent. There was no test file here at all, which is why it shipped.
import { describe, expect, it } from 'vitest';
import { deriveAccentPalette, hexToOklch, oklchToString } from './palette';

/** Bare `L C H` channels — three numbers, no function wrapper. */
const CHANNELS = /^-?\d*\.?\d+ -?\d*\.?\d+ -?\d*\.?\d+$/;

describe('oklchToString', () => {
  it('returns channels, never a wrapped colour', () => {
    const out = oklchToString({ l: 0.5, c: 0.1, h: 200 });
    expect(out).toMatch(CHANNELS);
    expect(out).not.toContain('oklch');
  });

  it('round-trips a hex through hexToOklch as channels', () => {
    const out = oklchToString(hexToOklch('#F8FAFC'));
    expect(out).toMatch(CHANNELS);
  });
});

describe('deriveAccentPalette', () => {
  // The regression: no accentColorForeground → the auto-contrast branch.
  it.each([
    ['a light accent', '#F8FAFC'],
    ['a dark accent', '#0F172A'],
    ['a saturated accent', '#7C3AED'],
  ])('emits channels for every token with %s and no explicit foreground', (_label, accent) => {
    const palette = deriveAccentPalette(accent);
    const wrapped = Object.entries(palette).filter(([, v]) => typeof v === 'string' && v.includes('oklch'));
    expect(wrapped).toEqual([]);
    for (const [name, value] of Object.entries(palette)) {
      if (typeof value !== 'string' || !name.startsWith('--jaw-color-')) continue;
      expect(value, `${name} must be channels`).toMatch(CHANNELS);
    }
  });

  it('still emits channels when a foreground IS supplied', () => {
    const palette = deriveAccentPalette('#7C3AED', '#FFFFFF');
    for (const [name, value] of Object.entries(palette)) {
      if (typeof value !== 'string' || !name.startsWith('--jaw-color-')) continue;
      expect(value, `${name} must be channels`).toMatch(CHANNELS);
    }
  });

  // A light accent needs dark text and a dark accent needs light text; the branch picking between
  // them is the one that was broken, so pin the direction as well as the format.
  it('picks a dark foreground for a light accent and a light one for a dark accent', () => {
    const onLight = deriveAccentPalette('#F8FAFC')['--jaw-color-primary-foreground'] as string;
    const onDark = deriveAccentPalette('#0F172A')['--jaw-color-primary-foreground'] as string;
    const lightnessOf = (channels: string) => Number(channels.split(' ')[0]);
    expect(lightnessOf(onLight)).toBeLessThan(0.5);
    expect(lightnessOf(onDark)).toBeGreaterThan(0.5);
  });
});
