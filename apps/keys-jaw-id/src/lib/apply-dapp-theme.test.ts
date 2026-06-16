import { describe, it, expect, vi } from 'vitest';

import { hexToHslTriplet, luminance, applyDappTheme, THEME_MODE_ATTR, isModePinned } from './apply-dapp-theme';

describe('isModePinned', () => {
  it('treats explicit light/dark as pinned (OS listener yields)', () => {
    expect(isModePinned('light')).toBe(true);
    expect(isModePinned('dark')).toBe(true);
  });

  it('treats auto / null / unknown as not pinned (OS stays in charge)', () => {
    expect(isModePinned('auto')).toBe(false);
    expect(isModePinned(null)).toBe(false);
    expect(isModePinned('whatever')).toBe(false);
  });
});

describe('hexToHslTriplet', () => {
  it('converts white and black', () => {
    expect(hexToHslTriplet('#ffffff')).toBe('0 0% 100%');
    expect(hexToHslTriplet('#000000')).toBe('0 0% 0%');
  });

  it('converts a known accent (#6366f1 indigo)', () => {
    // ~239deg, ~84%, ~67%
    const t = hexToHslTriplet('#6366f1')!;
    const [h, s, l] = t.split(' ');
    expect(Number(h)).toBeGreaterThanOrEqual(235);
    expect(Number(h)).toBeLessThanOrEqual(245);
    expect(s).toMatch(/%$/);
    expect(l).toMatch(/%$/);
  });

  it('accepts shorthand #rgb', () => {
    expect(hexToHslTriplet('#fff')).toBe('0 0% 100%');
  });

  it('tolerates a missing # and whitespace', () => {
    expect(hexToHslTriplet('  ffffff ')).toBe('0 0% 100%');
  });

  it('returns null for invalid input', () => {
    expect(hexToHslTriplet('nope')).toBeNull();
    expect(hexToHslTriplet('#12')).toBeNull();
  });
});

describe('luminance', () => {
  it('is 1 for white and 0 for black', () => {
    expect(luminance('#ffffff')).toBeCloseTo(1, 5);
    expect(luminance('#000000')).toBeCloseTo(0, 5);
  });

  it('orders light above dark', () => {
    expect(luminance('#fde047')).toBeGreaterThan(0.5); // light yellow
    expect(luminance('#1e293b')).toBeLessThan(0.5); // dark slate
  });
});

describe('applyDappTheme', () => {
  function fakeWindow(prefersDark = false) {
    const style: Record<string, string> = {};
    const classes = new Set<string>();
    const attrs: Record<string, string> = {};
    const root = {
      style: {
        colorScheme: '',
        setProperty: (k: string, v: string) => (style[k] = v),
      },
      classList: {
        add: (c: string) => classes.add(c),
        remove: (...cs: string[]) => cs.forEach((c) => classes.delete(c)),
        toggle: (c: string, on: boolean) => (on ? classes.add(c) : classes.delete(c)),
        contains: (c: string) => classes.has(c),
      },
      setAttribute: (k: string, v: string) => (attrs[k] = v),
      getAttribute: (k: string) => attrs[k] ?? null,
    };
    return {
      win: {
        document: { documentElement: root },
        matchMedia: vi.fn(() => ({ matches: prefersDark })),
      } as unknown as Window,
      style,
      classes,
      attrs,
    };
  }

  it('sets accent into --primary/--ring with a light foreground for a dark accent', () => {
    const { win, style } = fakeWindow();
    applyDappTheme({ accentColor: '#6366f1' }, win);
    expect(style['--primary']).toBe(hexToHslTriplet('#6366f1'));
    expect(style['--ring']).toBe(hexToHslTriplet('#6366f1'));
    expect(style['--primary-foreground']).toBe('210 40% 98%'); // light fg on dark accent
  });

  it('uses a dark foreground for a light accent', () => {
    const { win, style } = fakeWindow();
    applyDappTheme({ accentColor: '#fde047' }, win);
    expect(style['--primary-foreground']).toBe('222.2 47.4% 11.2%');
  });

  it('maps the border radius preset to --radius', () => {
    const { win, style } = fakeWindow();
    applyDappTheme({ borderRadius: 'lg' }, win);
    expect(style['--radius']).toBe('0.75rem');
  });

  it('applies the dark class (and not light) for explicit dark mode', () => {
    const { win, classes } = fakeWindow();
    applyDappTheme({ mode: 'dark' }, win);
    expect(classes.has('dark')).toBe(true);
    expect(classes.has('light')).toBe(false);
  });

  it('applies the light class (and not dark) for explicit light mode', () => {
    const { win, classes } = fakeWindow(true /* OS is dark, but dApp says light */);
    applyDappTheme({ mode: 'light' }, win);
    expect(classes.has('light')).toBe(true);
    expect(classes.has('dark')).toBe(false);
  });

  it("follows the system for 'auto' mode", () => {
    const dark = fakeWindow(true);
    applyDappTheme({ mode: 'auto' }, dark.win);
    expect(dark.classes.has('dark')).toBe(true);

    const light = fakeWindow(false);
    applyDappTheme({ mode: 'auto' }, light.win);
    expect(light.classes.has('light')).toBe(true);
    expect(light.classes.has('dark')).toBe(false);
  });

  it('maps the font stack preset to --app-font-family', () => {
    const { win, style } = fakeWindow();
    applyDappTheme({ fontStack: 'mono' }, win);
    expect(style['--app-font-family']).toContain('monospace');

    const rounded = fakeWindow();
    applyDappTheme({ fontStack: 'rounded' }, rounded.win);
    expect(rounded.style['--app-font-family']).toContain('Nunito');
  });

  it('leaves --app-font-family unset when no fontStack is given', () => {
    const { win, style } = fakeWindow();
    applyDappTheme({ accentColor: '#6366f1' }, win);
    expect(style['--app-font-family']).toBeUndefined();
  });

  it('pins an explicit mode on the html attribute so the OS listener yields', () => {
    const light = fakeWindow(true /* OS dark, dApp says light */);
    applyDappTheme({ mode: 'light' }, light.win);
    expect(light.attrs[THEME_MODE_ATTR]).toBe('light');

    const dark = fakeWindow();
    applyDappTheme({ mode: 'dark' }, dark.win);
    expect(dark.attrs[THEME_MODE_ATTR]).toBe('dark');
  });

  it("records 'auto' (not a pin) for auto/unset mode so the OS listener stays in charge", () => {
    const auto = fakeWindow();
    applyDappTheme({ mode: 'auto' }, auto.win);
    expect(auto.attrs[THEME_MODE_ATTR]).toBe('auto');

    const unset = fakeWindow();
    applyDappTheme({ accentColor: '#6366f1' }, unset.win);
    expect(unset.attrs[THEME_MODE_ATTR]).toBe('auto');
  });

  it('never writes oklch into keys HSL tokens (regression: transparency bug)', () => {
    const { win, style } = fakeWindow();
    applyDappTheme({ accentColor: '#6366f1', borderRadius: 'md' }, win);
    for (const value of Object.values(style)) {
      expect(value).not.toMatch(/oklch|hsl|rgb|#/);
    }
  });
});
