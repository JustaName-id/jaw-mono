/**
 * Resolves the keys.jaw.id URL the SDK should talk to, adapting to the
 * environment so a *preview* deployment of the demo exercises the matching
 * *preview* keys app instead of production keys.jaw.id. Mirrors
 * apps/playground/lib/keys-url.ts.
 *
 * Resolution order (first match wins):
 *   1. NEXT_PUBLIC_KEYS_URL — explicit override. Local dev points this at
 *      the local keys app; it can also pin a specific keys deployment.
 *   2. Per-PR derivation — a demo and keys preview for the same branch share
 *      Vercel's stable branch-alias suffix and differ only by the project
 *      slug, e.g.
 *        demo-git-<branch>-<team>.vercel.app
 *        keys-jaw-id-git-<branch>-<team>.vercel.app
 *      so we swap the slug to reach THIS PR's own keys preview. Only the
 *      `-git-<branch>-` alias form is deterministic across projects, and we
 *      skip it when the derived hostname would exceed Vercel's 63-char label
 *      limit (Vercel would hash it, making it non-derivable).
 *   3. undefined — production, non-derivable preview hosts, and SSR: the SDK
 *      falls back to its default keys.jaw.id.
 */

// Vercel *project names* as they appear in the git branch-alias hostname
// (`<project>-git-<branch>-<team>.vercel.app`). If either project is renamed
// in Vercel, update these or per-PR derivation silently falls back to
// production keys.
const DEMO_PREFIX = 'demo';
const KEYS_PREFIX = 'keys-jaw-id';
const VERCEL_PREVIEW_SUFFIX = '.vercel.app';
const BRANCH_ALIAS_MARKER = `${DEMO_PREFIX}-git-`;
// Max length of a single DNS label; past this Vercel hashes the branch alias,
// so the cross-project hostname is no longer deterministic.
const MAX_DNS_LABEL_LENGTH = 63;

/**
 * Derives this PR's keys preview URL from the demo's Vercel branch-alias
 * host, or undefined when the host isn't a deterministically mappable
 * demo preview.
 */
function derivePreviewKeysUrl(host: string): string | undefined {
  if (!host.endsWith(VERCEL_PREVIEW_SUFFIX) || !host.startsWith(BRANCH_ALIAS_MARKER)) {
    return undefined;
  }
  const keysHost = `${KEYS_PREFIX}${host.slice(DEMO_PREFIX.length)}`;
  const label = keysHost.slice(0, keysHost.length - VERCEL_PREVIEW_SUFFIX.length);
  if (label.length > MAX_DNS_LABEL_LENGTH) return undefined;
  return `https://${keysHost}`;
}

export function resolveKeysUrl(): string | undefined {
  // 1. Explicit override (local dev / pinned deployment).
  if (process.env.NEXT_PUBLIC_KEYS_URL) return process.env.NEXT_PUBLIC_KEYS_URL;

  // 2. Per-PR: reach this PR's own keys preview (browser only).
  if (typeof window !== 'undefined') {
    const derived = derivePreviewKeysUrl(window.location.host.toLowerCase());
    if (derived) return derived;
  }

  // 3. Production / non-derivable preview / SSR → SDK default (keys.jaw.id).
  return undefined;
}
