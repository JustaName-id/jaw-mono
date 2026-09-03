import qrcode from 'qrcode-generator';

/**
 * Modules left clear in the middle, as a fraction of the code's width. Error
 * correction covers the loss (level H tolerates ~30% damage), which is the same
 * budget every wallet's logo-in-the-middle QR spends.
 */
const CENTER_RATIO = 0.22;

export interface QrPath {
  /** SVG path data in module units, one subpath per dark module. */
  path: string;
  /** Modules per side, which is also the viewBox extent. */
  count: number;
}

/**
 * Encodes `value` and returns one `<path>` covering every dark module.
 *
 * A single path rather than a rect per module because a 41x41 code is over 1600
 * elements, and the dialog re-renders on every ENS resolution and theme change.
 *
 * Error correction is fixed at 'H': a phone camera reads this off a screen at an
 * angle, often smaller than intended, and the reserved centre eats part of the
 * budget.
 */
export function buildQrPath(value: string, reserveCenter = true): QrPath {
  // typeNumber 0 lets the library pick the smallest version that fits.
  const qr = qrcode(0, 'H');
  qr.addData(value);
  qr.make();

  const count = qr.getModuleCount();
  const hole = reserveCenter ? centerHole(count) : null;

  let path = '';
  for (let row = 0; row < count; row++) {
    for (let col = 0; col < count; col++) {
      if (!qr.isDark(row, col)) continue;
      if (hole && row >= hole.from && row <= hole.to && col >= hole.from && col <= hole.to) continue;
      path += `M${col},${row}h1v1h-1z`;
    }
  }

  return { path, count };
}

/**
 * The reserved square, in module coordinates, centred and symmetric.
 *
 * Exported for the test: an off-centre hole is invisible in review and obvious
 * on a phone.
 */
export function centerHole(count: number): { from: number; to: number } {
  // Rounded to an odd module count so it sits exactly on centre — an even one
  // would be a half-module off and read as a lopsided hole.
  let span = Math.round(count * CENTER_RATIO);
  if (span % 2 === 0) span += 1;
  const from = Math.floor((count - span) / 2);
  return { from, to: from + span - 1 };
}
