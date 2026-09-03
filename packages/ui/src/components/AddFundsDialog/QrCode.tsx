'use client';

import { useMemo } from 'react';
import { buildQrPath } from '../../utils/qrPath';

export interface QrCodeProps {
  /** The payload. For the receive screen this is an EIP-681 URI. */
  value: string;
  /** Rendered edge length in px. The SVG scales to it, so any size stays crisp. */
  size?: number;
  /**
   * Reserved clear square in the middle. Phase 3 puts the chain icon here, so
   * the space is held from the start rather than re-cut later, which would
   * change the module layout of a code users may have already scanned.
   */
  reserveCenter?: boolean;
  /** Accessible name. Describes the code rather than reading the URI aloud. */
  label?: string;
  /** Rendered into the reserved centre. Empty in phase 1. */
  children?: React.ReactNode;
}

/**
 * The receive QR, drawn as an SVG path built from `qrcode-generator`'s module
 * matrix (see `utils/qrPath`).
 *
 * Rendering it here rather than using the library's own `createSvgTag` keeps its
 * markup out of the DOM: no `dangerouslySetInnerHTML`, no inline styles of its
 * making, and the modules take `currentColor` so the code inverts with the theme
 * instead of staying black on a dark surface.
 */
export function QrCode({ value, size = 220, reserveCenter = true, label, children }: QrCodeProps) {
  const { path, count } = useMemo(() => buildQrPath(value, reserveCenter), [value, reserveCenter]);

  return (
    <div className="relative" style={{ width: size, height: size }}>
      {/* Authored in module units and scaled by the viewBox, so the path is
          independent of the pixel size and a resize re-encodes nothing. */}
      <svg
        viewBox={`0 0 ${count} ${count}`}
        width={size}
        height={size}
        role="img"
        aria-label={label ?? 'QR code for this address'}
        // Adjacent modules must not leave hairline seams between them, which is
        // what a scanner reads as a broken module.
        shapeRendering="crispEdges"
        className="text-foreground block"
      >
        <path d={path} fill="currentColor" />
      </svg>
      {/* Phase 3's chain icon lands here. Kept mounted and empty so the
          surrounding layout is already the final one. */}
      {reserveCenter && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">{children}</div>
      )}
    </div>
  );
}
