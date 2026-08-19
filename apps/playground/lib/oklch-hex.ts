/**
 * Convert the SDK's bare OKLCH channel strings ("L C H", as stored in
 * DEFAULT_LIGHT_PALETTE / DEFAULT_DARK_PALETTE) to #rrggbb hex, so the theme
 * editor's <input type="color"> fields can display palette defaults.
 * Inverse of @jaw.id/ui's hex → OKLCH chain (Björn Ottosson's matrices),
 * clamped to sRGB.
 */
export function oklchChannelsToHex(channels: string): string | null {
  const m = channels.trim().match(/^([\d.]+)\s+([\d.]+)\s+([\d.]+)$/);
  if (!m) return null;
  const [L, C, H] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const hr = (H * Math.PI) / 180;
  const a = C * Math.cos(hr);
  const bLab = C * Math.sin(hr);
  const l3 = (L + 0.3963377774 * a + 0.2158037573 * bLab) ** 3;
  const m3 = (L - 0.1055613458 * a - 0.0638541728 * bLab) ** 3;
  const s3 = (L - 0.0894841775 * a - 1.291485548 * bLab) ** 3;
  const lin = [
    4.0767416621 * l3 - 3.3077115913 * m3 + 0.2309699292 * s3,
    -1.2684380046 * l3 + 2.6097574011 * m3 - 0.3413193965 * s3,
    -0.0041960863 * l3 - 0.7034186147 * m3 + 1.707614701 * s3,
  ];
  const hex = lin
    .map((c) => {
      const clamped = Math.min(1, Math.max(0, c));
      const srgb = clamped <= 0.0031308 ? 12.92 * clamped : 1.055 * clamped ** (1 / 2.4) - 0.055;
      return Math.round(srgb * 255)
        .toString(16)
        .padStart(2, '0');
    })
    .join('');
  return `#${hex}`;
}
