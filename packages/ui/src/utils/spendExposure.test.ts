import { describe, it, expect } from 'vitest';
import { spendExposure } from './spendExposure';

const NOW = 1_760_000_000;
const days = (n: number) => NOW + n * 86_400;

describe('spendExposure', () => {
  it('multiplies the allowance by the windows the permission lives through', () => {
    expect(spendExposure({ allowance: 10_000_000n, unit: 'day', multiplier: 1, expiry: days(30), now: NOW })).toEqual({
      periods: 30,
      total: 300_000_000n,
    });
  });

  it('counts a partly used window as a whole one', () => {
    // 30 days and an hour still touches a 31st window, and that window's whole
    // allowance is spendable inside it.
    const exposure = spendExposure({ allowance: 1n, unit: 'day', multiplier: 1, expiry: days(30) + 3_600, now: NOW });
    expect(exposure).toEqual({ periods: 31, total: 31n });
  });

  it('applies the multiplier to the window', () => {
    expect(spendExposure({ allowance: 5n, unit: 'day', multiplier: 7, expiry: days(28), now: NOW })).toEqual({
      periods: 4,
      total: 20n,
    });
  });

  // A shorter period is more money over the same time, which is the whole point
  // of showing a total rather than a rate.
  it('reports more for an hourly limit than a daily one at the same allowance', () => {
    const hourly = spendExposure({ allowance: 1n, unit: 'hour', multiplier: 1, expiry: days(1), now: NOW });
    const daily = spendExposure({ allowance: 1n, unit: 'day', multiplier: 1, expiry: days(1), now: NOW });
    expect(hourly?.total).toBe(24n);
    expect(daily?.total).toBe(1n);
  });

  it('treats forever as a single allowance for the whole permission', () => {
    expect(spendExposure({ allowance: 42n, unit: 'forever', multiplier: 1, expiry: days(365), now: NOW })).toEqual({
      periods: 1,
      total: 42n,
    });
  });

  // The contract steps calendar months, so a month is 28 to 31 days. Measuring
  // it at its shortest fits the most windows into a grant, which is the only
  // direction a figure the user reads as a bound may round.
  it('measures a month at its shortest', () => {
    expect(spendExposure({ allowance: 1n, unit: 'month', multiplier: 1, expiry: days(28), now: NOW })?.periods).toBe(1);
    expect(spendExposure({ allowance: 1n, unit: 'month', multiplier: 1, expiry: days(29), now: NOW })?.periods).toBe(2);
  });

  it('measures a year as twelve of those months, since the chain has no year', () => {
    expect(spendExposure({ allowance: 1n, unit: 'year', multiplier: 1, expiry: days(336), now: NOW })?.periods).toBe(1);
  });

  it('returns null for a unit it does not recognise', () => {
    expect(spendExposure({ allowance: 1n, unit: 'fortnight', multiplier: 1, expiry: days(30), now: NOW })).toBeNull();
  });

  it('returns null once the permission has expired', () => {
    expect(spendExposure({ allowance: 1n, unit: 'day', multiplier: 1, expiry: days(-1), now: NOW })).toBeNull();
    expect(spendExposure({ allowance: 1n, unit: 'day', multiplier: 1, expiry: NOW, now: NOW })).toBeNull();
  });

  it('returns null rather than guessing at a broken multiplier', () => {
    expect(spendExposure({ allowance: 1n, unit: 'day', multiplier: 0, expiry: days(30), now: NOW })).toBeNull();
    expect(spendExposure({ allowance: 1n, unit: 'day', multiplier: NaN, expiry: days(30), now: NOW })).toBeNull();
  });
});

// `unit` is whatever the dApp wrote. A plain index would answer `constructor`
// with a function, which is truthy, and the arithmetic downstream then throws
// inside the render of the grant screen.
describe('a unit that resolves off the object prototype', () => {
  it.each(['constructor', 'toString', 'hasOwnProperty', 'valueOf', '__proto__'])(
    'treats %s as an unrecognised unit rather than throwing',
    (unit) => {
      expect(spendExposure({ allowance: 10n, unit, multiplier: 1, expiry: days(30), now: NOW })).toBeNull();
    }
  );
});
