/**
 * Resolves the keys.jaw.id URL the SDK should talk to, adapting to the
 * environment so a *preview* deployment of the playground exercises the
 * matching *preview* keys app instead of production keys.jaw.id.
 *
 * Resolution order (first match wins):
 *   1. NEXT_PUBLIC_KEYS_URL — explicit override. Local dev points this at
 *      http://localhost:3000; it can also pin a specific keys deployment.
 *   2. Per-PR derivation — a playground and keys preview for the same branch
 *      share Vercel's stable branch-alias suffix and differ only by the project
 *      slug, e.g.
 *        playground-git-<branch>-<team>.vercel.app
 *        keys-jaw-id-git-<branch>-<team>.vercel.app
 *      so we swap the slug to reach THIS PR's own keys preview. Only the
 *      `-git-<branch>-` alias form is deterministic across projects (the
 *      per-deployment hash form is not shared), and we skip it when the derived
 *      hostname would exceed Vercel's 63-char label limit (Vercel would hash it,
 *      making it non-derivable).
 *   3. undefined — production, non-derivable preview hosts (the immutable
 *      per-deployment hash URL, long branch names), and SSR: the SDK falls back
 *      to its default keys.jaw.id.
 *
 * Step 2 only runs in the browser, so production (playground.jaw.id) and SSR
 * always resolve to the SDK default.
 */

// Vercel *project names* as they appear in the git BRANCH-ALIAS hostname
// (`<project>-git-<branch>-<team>.vercel.app`) — which is what we derive against.
// Verified live: playground → `playground`, keys → `keys-jaw-id`.
// NOTE: the per-deployment *hash* URL truncates keys to `keys-jaw`
// (`keys-jaw-<hash>-…`), but that form is NOT what we target — the branch alias
// keeps the full project name. If either project is renamed in Vercel, update
// these or per-PR derivation silently falls back to production keys.
//
// Coupling note: derivation assumes BOTH projects deploy a preview for every
// branch. That holds today because neither vercel.json sets an affected/ignore
// build step. If keys ever skips unaffected builds, a playground-only PR would
// derive a keys URL that was never deployed — keep their build triggers in
// lockstep, or this must fall back instead.
const PLAYGROUND_PREFIX = 'playground';
const KEYS_PREFIX = 'keys-jaw-id';
const VERCEL_PREVIEW_SUFFIX = '.vercel.app';
const BRANCH_ALIAS_MARKER = `${PLAYGROUND_PREFIX}-git-`;
// Max length of a single DNS label; past this Vercel hashes the branch alias,
// so the cross-project hostname is no longer deterministic.
const MAX_DNS_LABEL_LENGTH = 63;

/**
 * Derives this PR's keys preview URL from the playground Vercel branch-alias
 * host, or undefined when the host isn't a deterministically mappable
 * playground preview.
 */
function derivePreviewKeysUrl(host: string): string | undefined {
  if (!host.endsWith(VERCEL_PREVIEW_SUFFIX) || !host.startsWith(BRANCH_ALIAS_MARKER)) {
    return undefined;
  }
  const keysHost = `${KEYS_PREFIX}${host.slice(PLAYGROUND_PREFIX.length)}`;
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
