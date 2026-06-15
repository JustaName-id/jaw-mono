/**
 * Sanitize an untrusted, externally-controlled display string (a dApp/SIWE app
 * name) before it's shown as an identity header in a trust dialog: strip
 * control/bidi/zero-width chars and cap length. Returns '' when nothing legible
 * remains so callers can fall back to a default.
 */
export function sanitizeDisplayName(name: string, maxLength = 64): string {
  const cleaned = name
    // eslint-disable-next-line no-control-regex -- C0/C1, zero-width, bidi, format chars, BOM
    .replace(/[\u0000-\u001F\u007F-\u009F\u200B-\u200F\u202A-\u202E\u2060-\u206F\uFEFF]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  return cleaned.length > maxLength ? `${cleaned.slice(0, maxLength)}…` : cleaned;
}
