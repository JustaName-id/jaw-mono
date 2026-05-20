/**
 * Per-origin permission table, EIP-2255 style.
 *
 * Every wallet extension that ships to a real audience needs this: the SDK
 * represents the user's one wallet, but each dApp origin must be approved
 * independently before it can see accounts, request signatures, or trigger
 * chain switches. Otherwise opening dApp B in another tab silently leaks the
 * accounts dApp A connected with — that's the bug this module closes.
 *
 * Storage:
 *   chrome.storage.local["jaw.permissions"]
 *
 * Accessible from background SW and popup. NOT readable from the offscreen
 * document — chrome.storage isn't exposed there (same constraint we worked
 * around for settings). The background acts as the policy enforcement point;
 * offscreen never sees the table.
 *
 * Schema is versioned. `migrate()` makes the read path tolerant of legacy or
 * corrupted entries so a bad record can never crash the extension.
 */

export interface OriginPermissions {
  /** Checksummed addresses granted to this origin. Multi-account-safe.
   *  Empty array = tombstone: origin was previously granted then revoked.
   *  Combined with `revokedAt` it lets us block wagmi autoConnect attempts
   *  from immediately re-granting on refresh. */
  accounts: string[];
  /** ms timestamp when the origin was first granted access. */
  grantedAt: number;
  /** ms timestamp of the most recent grant write. Used by the popup to sort
   *  Connected dApps by recency. Not updated per-RPC to avoid a hot-path
   *  read-modify-write race against the popup's revoke. */
  lastSeenAt: number;
  /** ms timestamp of the most recent user-initiated revoke. Used by the
   *  background's gate to enforce a cooldown so autoConnect attempts in
   *  the seconds after a revoke do not silently re-grant the origin. */
  revokedAt?: number;
}

/** Default cooldown after a user-initiated revoke during which grant
 *  attempts from the same origin are rejected. Sole purpose: defeat
 *  wagmi/RainbowKit autoConnect that fires sub-second when a tab restores
 *  with a tombstone present. A deliberate user click to reconnect on the
 *  same loaded page takes >1s to perceive + click, so this window blocks
 *  the racy autoConnect but lets the manual reconnect succeed. */
export const REVOKE_COOLDOWN_MS = 1_500;

export interface PermissionsState {
  schemaVersion: 1;
  origins: Record<string, OriginPermissions>;
}

export const DEFAULT_PERMISSIONS: PermissionsState = {
  schemaVersion: 1,
  origins: {},
};

const STORAGE_KEY = 'jaw.permissions';

/** Read the full permissions table. Returns defaults on missing/corrupt. */
export async function getPermissions(): Promise<PermissionsState> {
  const raw = await chrome.storage.local.get(STORAGE_KEY);
  const stored = raw[STORAGE_KEY] as unknown;
  if (!stored || typeof stored !== 'object') return { ...DEFAULT_PERMISSIONS };
  return migrate(stored as Partial<PermissionsState>);
}

/** Returns the accounts array for an origin. Empty array if not permitted. */
export async function getAccountsForOrigin(origin: string): Promise<string[]> {
  const state = await getPermissions();
  return state.origins[origin]?.accounts ?? [];
}

/** True iff the origin has at least one granted account. */
export async function isPermitted(origin: string): Promise<boolean> {
  const accounts = await getAccountsForOrigin(origin);
  return accounts.length > 0;
}

/**
 * Grant or update permissions for an origin. Called after a successful
 * `eth_requestAccounts` / `wallet_connect` response.
 *
 * Accounts are normalized to lowercase hex strings (matching what dApps
 * receive from `eth_accounts`). Duplicates are removed.
 */
// Single-writer mutex for all permission writes within this context. Without
// this, two concurrent writes (e.g. wagmi's periodic wallet_connect's grant
// running in parallel with the popup's ✕ revoke) read-modify-write and the
// second one CLOBBERS the first.
let writeQueue: Promise<unknown> = Promise.resolve();
function serializeWrite<T>(fn: () => Promise<T>): Promise<T> {
  const next = writeQueue.then(fn);
  writeQueue = next.catch(() => undefined);
  return next as Promise<T>;
}

export async function grantOrigin(origin: string, accounts: string[]): Promise<void> {
  if (!origin || !accounts || accounts.length === 0) return;
  return serializeWrite(async () => {
    const state = await getPermissions();
    const now = Date.now();
    const normalized = dedupeLower(accounts);
    const existing = state.origins[origin];

    // Refuse to undo a fresh user-initiated revoke. If the origin has a
    // recent tombstone (within cooldown window), the user explicitly chose
    // to disconnect. A concurrent grant flow from the dApp's autoConnect /
    // session-refresh should NOT silently re-grant.
    if (
      existing &&
      existing.accounts.length === 0 &&
      typeof existing.revokedAt === 'number' &&
      now - existing.revokedAt < REVOKE_COOLDOWN_MS
    ) {
      return;
    }

    // Always write. A previous idempotent-skip optimization was misfiring
    // when a tombstone race produced a stale `existing` view that looked
    // granted — the skip masked the post-revoke grant attempt and the
    // popup row never reappeared. The cost of always writing is a single
    // storage round-trip on duplicate grants; cheap.
    const next: PermissionsState = {
      ...state,
      origins: {
        ...state.origins,
        [origin]: {
          accounts: normalized,
          grantedAt: existing?.grantedAt ?? now,
          lastSeenAt: now,
        },
      },
    };
    await chrome.storage.local.set({ [STORAGE_KEY]: next });
  });
}

/**
 * User-initiated revoke. Keeps a tombstone (`accounts: []` + `revokedAt`)
 * so the background can enforce a short cooldown that defeats wagmi's
 * autoConnect attempts on the next page refresh.
 *
 * Always writes the tombstone even if no prior entry exists — audit
 * MEDIUM-2: otherwise after `migrate` prunes an expired tombstone, the
 * user clicking ✕ again would silently no-op and the dApp would be free
 * to reconnect immediately via autoConnect.
 */
export async function revokeOrigin(origin: string): Promise<void> {
  if (!origin) return;
  return serializeWrite(async () => {
    const state = await getPermissions();
    const existing = state.origins[origin];
    const now = Date.now();
    const next: PermissionsState = {
      ...state,
      origins: {
        ...state.origins,
        [origin]: {
          accounts: [],
          grantedAt: existing?.grantedAt ?? now,
          lastSeenAt: existing?.lastSeenAt ?? now,
          revokedAt: now,
        },
      },
    };
    await chrome.storage.local.set({ [STORAGE_KEY]: next });
  });
}

/**
 * Returns true if the origin was revoked within the cooldown window.
 * Background uses this to gate `eth_requestAccounts` / `wallet_connect`
 * so autoConnect attempts after a revoke don't silently re-grant.
 */
export function isWithinRevokeCooldown(
  state: PermissionsState,
  origin: string,
  cooldownMs = REVOKE_COOLDOWN_MS
): boolean {
  const entry = state.origins[origin];
  if (!entry || entry.accounts.length > 0) return false;
  const revokedAt = entry.revokedAt;
  if (typeof revokedAt !== 'number') return false;
  return Date.now() - revokedAt < cooldownMs;
}

/**
 * Lock-all (popup ⏻ button). Audit CRITICAL-1: must NOT blank the table —
 * that destroyed the tombstones and let wagmi autoConnect re-grant every
 * dApp on the next page reload. We tombstone each currently-granted origin
 * instead so the cooldown applies to all of them.
 */
export async function revokeAll(): Promise<void> {
  return serializeWrite(async () => {
    const state = await getPermissions();
    const now = Date.now();
    const nextOrigins: Record<string, OriginPermissions> = {};
    for (const [origin, entry] of Object.entries(state.origins)) {
      nextOrigins[origin] = {
        accounts: [],
        grantedAt: entry.grantedAt,
        lastSeenAt: entry.lastSeenAt,
        revokedAt: now,
      };
    }
    const next: PermissionsState = { schemaVersion: 1, origins: nextOrigins };
    await chrome.storage.local.set({ [STORAGE_KEY]: next });
  });
}

/**
 * After the SDK emits `accountsChanged`, the canonical accounts list may have
 * shrunk (e.g. a user revoked a sub-account). Intersect each origin's stored
 * accounts with the new canonical list so a permitted origin can never see an
 * account the user has since detached.
 *
 * If after intersection an origin has no accounts, it is auto-revoked — that
 * matches what wagmi/viem expect when accounts change to `[]`.
 */
export async function syncAccountsWithCanonical(canonical: string[]): Promise<PermissionsState> {
  return serializeWrite(async () => {
    const canonicalSet = new Set(canonical.map((a) => a.toLowerCase()));
    const state = await getPermissions();
    const now = Date.now();
    let dirty = false;
    const nextOrigins: Record<string, OriginPermissions> = {};
    for (const [origin, entry] of Object.entries(state.origins)) {
      const filtered = entry.accounts.filter((a) => canonicalSet.has(a.toLowerCase()));
      if (filtered.length === entry.accounts.length) {
        nextOrigins[origin] = entry;
        continue;
      }
      dirty = true;
      if (filtered.length === 0) {
        // Auto-revoke must leave a tombstone so the cooldown gate applies
        // on the dApp's next reconnect — otherwise a forced accountsChanged:[]
        // would let the dApp re-grant within the same second, bypassing the
        // user-initiated-revoke protection.
        nextOrigins[origin] = { ...entry, accounts: [], revokedAt: now };
        continue;
      }
      nextOrigins[origin] = { ...entry, accounts: filtered };
    }
    if (!dirty) return state;
    const next: PermissionsState = { ...state, origins: nextOrigins };
    await chrome.storage.local.set({ [STORAGE_KEY]: next });
    return next;
  });
}

/**
 * Subscribe to permission table changes (across all extension contexts).
 * The handler receives BOTH next and prev state so callers can diff without
 * having to maintain an in-memory mirror — critical for the background SW,
 * whose in-memory cache is wiped on every suspend/wake. Using `oldValue`
 * from `chrome.storage.onChanged` is the only reliable source of truth.
 * Returns a cleanup function.
 */
export function subscribePermissions(handler: (next: PermissionsState, prev: PermissionsState) => void): () => void {
  const listener = (changes: { [key: string]: chrome.storage.StorageChange }, areaName: string): void => {
    if (areaName !== 'local' || !changes[STORAGE_KEY]) return;
    const rawNext = changes[STORAGE_KEY].newValue as unknown;
    const rawPrev = changes[STORAGE_KEY].oldValue as unknown;
    const next =
      rawNext && typeof rawNext === 'object'
        ? migrate(rawNext as Partial<PermissionsState>)
        : { ...DEFAULT_PERMISSIONS };
    const prev =
      rawPrev && typeof rawPrev === 'object'
        ? migrate(rawPrev as Partial<PermissionsState>)
        : { ...DEFAULT_PERMISSIONS };
    handler(next, prev);
  };
  chrome.storage.onChanged.addListener(listener);
  return () => chrome.storage.onChanged.removeListener(listener);
}

function dedupeLower(arr: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const a of arr) {
    if (typeof a !== 'string') continue;
    const lower = a.toLowerCase();
    if (seen.has(lower)) continue;
    seen.add(lower);
    out.push(lower);
  }
  return out;
}

function migrate(stored: Partial<PermissionsState>): PermissionsState {
  // CRITICAL: build a fresh origins map. Spreading DEFAULT_PERMISSIONS
  // shares the same origins object reference, so two consecutive migrate
  // calls would mutate the SAME map — the second call's writes overwrite
  // the first call's, and BOTH returned PermissionsStates end up pointing
  // at the same final mutated origins object. That bug made
  // subscribePermissions report prev === next after a tombstone write
  // (both showed `granted`), which kept permissionsCache stale and let
  // wallet_connect slip past the cooldown gate.
  const out: PermissionsState = { schemaVersion: 1, origins: {} };
  const now = Date.now();
  if (stored.origins && typeof stored.origins === 'object') {
    for (const [origin, entry] of Object.entries(stored.origins)) {
      if (!isValidOriginEntry(entry)) continue;
      const e = entry as Partial<OriginPermissions>;
      const accounts = Array.isArray(e.accounts) ? dedupeLower(e.accounts as string[]) : [];
      const revokedAt = typeof e.revokedAt === 'number' && Number.isFinite(e.revokedAt) ? e.revokedAt : undefined;
      // Keep entries with accounts.
      // Keep empty-accounts entries ONLY while the revoke tombstone is still
      // within its cooldown window. After that the tombstone is pruned to
      // prevent unbounded storage growth across the user's lifetime.
      if (accounts.length === 0) {
        if (typeof revokedAt !== 'number' || now - revokedAt >= REVOKE_COOLDOWN_MS) continue;
      }
      out.origins[origin] = {
        accounts,
        grantedAt: typeof e.grantedAt === 'number' && Number.isFinite(e.grantedAt) ? e.grantedAt : now,
        lastSeenAt: typeof e.lastSeenAt === 'number' && Number.isFinite(e.lastSeenAt) ? e.lastSeenAt : now,
        ...(revokedAt !== undefined ? { revokedAt } : {}),
      };
    }
  }
  return out;
}

function isValidOriginEntry(v: unknown): boolean {
  return !!v && typeof v === 'object' && Array.isArray((v as { accounts?: unknown }).accounts);
}
