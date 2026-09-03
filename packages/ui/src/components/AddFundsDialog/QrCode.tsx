'use client';

import { useMemo } from 'react';
import { buildQrPath, centerHole } from '../../utils/qrPath';

export interface QrCodeProps {
  /** The payload. For the receive screen this is an EIP-681 URI. */
  value: string;
  /** Rendered edge length in px. The SVG scales to it, so any size stays crisp. */
  size?: number;
  /**
   * What sits in the middle, given the reserved square's size in px.
   *
   * Pass nothing and the code is solid: the modules are only cleared when
   * something is going to fill the space, so the code never shows a bare hole
   * that reads as a rendering fault.
   */
  renderCenter?: (sizePx: number) => React.ReactNode;
  /** Accessible name. Describes the code rather than reading the URI aloud. */
  label?: string;
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
export function QrCode({ value, size = 220, renderCenter, label }: QrCodeProps) {
  const reserveCenter = !!renderCenter;
  const { path, count } = useMemo(() => buildQrPath(value, reserveCenter), [value, reserveCenter]);

  // The cleared square in px, so what fills it is measured against the modules
  // actually removed rather than a guess that drifts when the payload's length
  // pushes the code to a larger version.
  const holePx = useMemo(() => {
    if (!reserveCenter) return 0;
    const { from, to } = centerHole(count);
    return ((to - from + 1) / count) * size;
  }, [reserveCenter, count, size]);

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
      {renderCenter && (
        <div
          className="pointer-events-none absolute left-1/2 top-1/2 flex items-center justify-center"
          style={{
            width: holePx,
            height: holePx,
            // Centred by translate rather than inset-0 so the box is exactly the
            // cleared square, which is what bounds what goes inside it.
            transform: 'translate(-50%, -50%)',
          }}
        >
          {/* Inset a little: the icon must not touch the surrounding modules,
              or a scanner reads the outermost ones as merged. */}
          {renderCenter(Math.round(holePx * 0.82))}
        </div>
      )}
    </div>
  );
}
