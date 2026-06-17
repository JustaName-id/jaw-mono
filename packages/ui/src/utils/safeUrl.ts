/**
 * Validates that a URL is safe to bind to an `<img src>` in a wallet dialog.
 *
 * Accepts only `https:` URLs or `data:image/` URIs. This blocks attacker
 * controlled `http:`/other-scheme beacons (which leak the user's IP/User-Agent
 * the moment a dialog opens) and rejects malformed values used for spoofing.
 */
export function isSafeImageUrl(url?: string | null): boolean {
  if (!url) return false;
  const trimmed = url.trim();
  if (/^data:image\//i.test(trimmed)) return true;
  try {
    return new URL(trimmed).protocol === 'https:';
  } catch {
    return false;
  }
}
