import { describe, expect, it } from 'vitest';

import { resolveTheme, themeColorVar } from './resolve-theme';
import { hexToOklch, oklchToString } from './palette';

describe('themeColorVar', () => {
  it('maps camelCase color keys to --jaw-color-* names', () => {
    expect(themeColorVar('background')).toBe('--jaw-color-background');
    expect(themeColorVar('cardForeground')).toBe('--jaw-color-card-foreground');
    expect(themeColorVar('identiconTile')).toBe('--jaw-color-identicon-tile');
    expect(themeColorVar('destructiveHover')).toBe('--jaw-color-destructive-hover');
  });
});

describe('resolveTheme semantic colors', () => {
  it('resolves hex colors into bare OKLCH channels', () => {
    const { variables } = resolveTheme({ colors: { background: '#0E2F28', warning: '#F5C24B' } }, 'dark');
    expect(variables['--jaw-color-background']).toBe(oklchToString(hexToOklch('#0E2F28')));
    expect(variables['--jaw-color-warning']).toBe(oklchToString(hexToOklch('#F5C24B')));
    // Channels only — never a wrapped color, or the oklch(var()/alpha) wrapper breaks.
    expect(variables['--jaw-color-background']).toMatch(/^[\d.]+ [\d.]+ [\d.]+$/);
  });

  it('colors outrank the accentColor derivation', () => {
    const { variables } = resolveTheme({ accentColor: '#6366f1', colors: { primary: '#34E3A0' } }, 'light');
    expect(variables['--jaw-color-primary']).toBe(oklchToString(hexToOklch('#34E3A0')));
  });

  it('cssVariables outrank colors', () => {
    const { variables } = resolveTheme(
      { colors: { primary: '#34E3A0' }, cssVariables: { '--jaw-color-primary': '0.5 0.1 200' } },
      'light'
    );
    expect(variables['--jaw-color-primary']).toBe('0.5 0.1 200');
  });

  it('skips invalid hex values and keeps the palette default', () => {
    const base = resolveTheme({}, 'light').variables['--jaw-color-primary'];
    const { variables } = resolveTheme({ colors: { primary: 'not-a-color' } }, 'light');
    expect(variables['--jaw-color-primary']).toBe(base);
  });
});
