import { describe, expect, it } from 'vitest';
import { maxUint160, maxUint256 } from 'viem';
import { dateTone, formatUnixDate, groupNumber, isUnixTimestamp, isUnlimitedAmount, maxUintFor } from './displayFormat';

describe('groupNumber', () => {
  it('thousands-separates integers and preserves fractions/sign', () => {
    expect(groupNumber('1000000')).toBe('1,000,000');
    expect(groupNumber('1000.5')).toBe('1,000.5');
    expect(groupNumber('-1234567')).toBe('-1,234,567');
    expect(groupNumber('999')).toBe('999');
  });
});

describe('maxUintFor', () => {
  it('computes the max for a uint width, null for non-uint types', () => {
    expect(maxUintFor('uint256')).toBe(maxUint256);
    expect(maxUintFor('uint160')).toBe(maxUint160);
    expect(maxUintFor('uint48')).toBe(281474976710655n);
    expect(maxUintFor('address')).toBeNull();
  });
});

describe('isUnlimitedAmount', () => {
  it('flags the uint256 / uint160 max sentinels', () => {
    expect(isUnlimitedAmount(maxUint256.toString())).toBe(true);
    expect(isUnlimitedAmount(maxUint160.toString())).toBe(true);
    // Permit2 unlimited amount literal (uint160 max):
    expect(isUnlimitedAmount('1461501637330902918203684832716283019655932542975')).toBe(true);
  });
  it('does not flag ordinary amounts or empty input', () => {
    expect(isUnlimitedAmount('500000000000000000')).toBe(false);
    expect(isUnlimitedAmount(undefined)).toBe(false);
    expect(isUnlimitedAmount('')).toBe(false);
  });
});

describe('isUnixTimestamp', () => {
  it('accepts values in the 2000..2100 window, rejects tiny/huge', () => {
    expect(isUnixTimestamp(1753358400n)).toBe(true);
    expect(isUnixTimestamp(100n)).toBe(false);
    expect(isUnixTimestamp(281474976710655n)).toBe(false); // uint48 max — a sentinel, not a date
  });
});

describe('formatUnixDate', () => {
  it('renders day-first abbreviated dates', () => {
    const s = formatUnixDate(1753358400); // 2025-07-24T12:00:00Z (noon → TZ-stable day)
    expect(s).toContain('24');
    expect(s).toContain('Jul');
    expect(s).toContain('2025');
  });
});

describe('dateTone', () => {
  const now = Math.floor(Date.now() / 1000);
  it('classifies past as expired', () => {
    expect(dateTone(now - 100)).toBe('expired');
    expect(dateTone('1000000000')).toBe('expired'); // 2001
  });
  it('classifies >1yr out as far', () => {
    expect(dateTone(now + 60 * 60 * 24 * 400)).toBe('far');
  });
  it('classifies near-future as normal', () => {
    expect(dateTone(now + 60 * 60 * 24 * 30)).toBe('normal');
  });
});
