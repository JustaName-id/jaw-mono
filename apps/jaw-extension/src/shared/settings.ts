/**
 * User-controlled extension settings persisted via chrome.storage.local.
 *
 * Used by:
 * - popup (read + write through Settings UI)
 * - offscreen (read at boot to seed JAW.create options)
 * - background (read for any future SW-driven decisions; not used today)
 *
 * Design notes:
 * - All fields are nullable; `null` means "use the build-time default".
 *   This lets us ship sensible mainnet-only defaults in production while
 *   letting power users override (e.g. enable testnets in a prod build, or
 *   pin a default chain).
 * - Schema is versioned. On read, if `schemaVersion` is older than current,
 *   `migrate()` rewrites the stored value. We never blow up users' configs.
 * - No secrets are stored here. API key stays compiled into the bundle.
 *   Anything sensitive (e.g. session secrets) lives in the offscreen's
 *   localStorage handled by the SDK, not in extension settings.
 */

export interface Settings {
  schemaVersion: 1;
  /** Override the build-time showTestnets default. `null` = use default. */
  showTestnets: boolean | null;
  /** Pin a chain to switch to on first connect. `null` = SDK default (1). */
  defaultChainId: number | null;
}

export const DEFAULT_SETTINGS: Settings = {
  schemaVersion: 1,
  showTestnets: null,
  defaultChainId: null,
};

const STORAGE_KEY = 'jaw.settings';

/** Read settings from chrome.storage.local. Returns defaults if nothing stored. */
export async function getSettings(): Promise<Settings> {
  const raw = await chrome.storage.local.get(STORAGE_KEY);
  const stored = raw[STORAGE_KEY] as unknown;
  if (!stored || typeof stored !== 'object') return { ...DEFAULT_SETTINGS };
  return migrate(stored as Partial<Settings>);
}

/** Merge a partial update into stored settings. Returns the new full Settings. */
export async function setSettings(patch: Partial<Omit<Settings, 'schemaVersion'>>): Promise<Settings> {
  const current = await getSettings();
  const next: Settings = { ...current, ...patch, schemaVersion: 1 };
  await chrome.storage.local.set({ [STORAGE_KEY]: next });
  return next;
}

/**
 * Subscribe to settings changes. Fires when any extension context writes
 * to chrome.storage.local under our key. Returns a cleanup function.
 */
export function subscribeSettings(handler: (next: Settings) => void): () => void {
  const listener = (changes: { [key: string]: chrome.storage.StorageChange }, areaName: string): void => {
    if (areaName !== 'local' || !changes[STORAGE_KEY]) return;
    const raw = changes[STORAGE_KEY].newValue as unknown;
    if (!raw || typeof raw !== 'object') {
      handler({ ...DEFAULT_SETTINGS });
      return;
    }
    handler(migrate(raw as Partial<Settings>));
  };
  chrome.storage.onChanged.addListener(listener);
  return () => chrome.storage.onChanged.removeListener(listener);
}

/**
 * Normalize stored settings to the current schema. Tolerant of missing or
 * unexpected fields so a corrupt/legacy entry never crashes the extension.
 */
function migrate(stored: Partial<Settings>): Settings {
  const out: Settings = { ...DEFAULT_SETTINGS };
  if (stored.showTestnets === true || stored.showTestnets === false) {
    out.showTestnets = stored.showTestnets;
  }
  if (typeof stored.defaultChainId === 'number' && Number.isFinite(stored.defaultChainId)) {
    out.defaultChainId = stored.defaultChainId;
  }
  // Future schema bumps: branch on stored.schemaVersion and remap fields here.
  return out;
}
