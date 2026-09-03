import { describe, expect, it } from 'vitest';
import { buildQrPath, centerHole } from './qrPath';
import { eip681Uri } from './eip681';

const ADDRESS = '0x1111111111111111111111111111111111111111';

/** Every `M<col>,<row>` in a path, as a set of "col,row" keys. */
function modules(path: string): Set<string> {
  return new Set([...path.matchAll(/M(\d+),(\d+)/g)].map((m) => `${m[1]},${m[2]}`));
}

describe('eip681Uri', () => {
  it('puts the chain in the payload, not just in the label', () => {
    expect(eip681Uri(ADDRESS, 8453)).toBe(`ethereum:${ADDRESS}@8453`);
  });
});

describe('buildQrPath', () => {
  it('encodes to a square matrix of odd extent', () => {
    const { count } = buildQrPath(eip681Uri(ADDRESS, 8453));
    // QR versions are 21 + 4n modules per side, so always odd and at least 21.
    expect(count).toBeGreaterThanOrEqual(21);
    expect(count % 2).toBe(1);
  });

  it('draws modules', () => {
    const { path } = buildQrPath(eip681Uri(ADDRESS, 8453));
    expect(modules(path).size).toBeGreaterThan(100);
  });

  // The three finder patterns are what a scanner locks onto first. Their outer
  // corners are always dark, so a path missing them is unscannable.
  it('keeps the finder patterns in all three corners', () => {
    const { path, count } = buildQrPath(eip681Uri(ADDRESS, 8453));
    const drawn = modules(path);
    expect(drawn.has('0,0')).toBe(true);
    expect(drawn.has(`${count - 1},0`)).toBe(true);
    expect(drawn.has(`0,${count - 1}`)).toBe(true);
  });

  // A different chain has to produce a different code, or the payload's whole
  // point (the scanner picking the network) is lost.
  it('changes the code when the chain changes', () => {
    const base = buildQrPath(eip681Uri(ADDRESS, 8453));
    const optimism = buildQrPath(eip681Uri(ADDRESS, 10));
    expect(optimism.path).not.toBe(base.path);
  });

  it('leaves the reserved centre clear', () => {
    const { path, count } = buildQrPath(eip681Uri(ADDRESS, 8453), true);
    const drawn = modules(path);
    const hole = centerHole(count);

    for (let row = hole.from; row <= hole.to; row++) {
      for (let col = hole.from; col <= hole.to; col++) {
        expect(drawn.has(`${col},${row}`)).toBe(false);
      }
    }
  });

  it('fills the centre when the reservation is off', () => {
    const value = eip681Uri(ADDRESS, 8453);
    const reserved = buildQrPath(value, true);
    const full = buildQrPath(value, false);
    expect(modules(full.path).size).toBeGreaterThan(modules(reserved.path).size);
    expect(full.count).toBe(reserved.count);
  });
});

describe('centerHole', () => {
  it('is centred and symmetric, so the hole never sits off-axis', () => {
    for (const count of [21, 25, 29, 33, 37, 41, 45]) {
      const { from, to } = centerHole(count);
      expect(count - 1 - to).toBe(from);
      expect((to - from + 1) % 2).toBe(1);
    }
  });

  it('stays a small fraction of the code, inside the error-correction budget', () => {
    for (const count of [21, 29, 41]) {
      const { from, to } = centerHole(count);
      const area = (to - from + 1) ** 2 / count ** 2;
      expect(area).toBeLessThan(0.1);
    }
  });
});
