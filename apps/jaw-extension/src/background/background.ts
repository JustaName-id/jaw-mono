import {
  JAW_KEYS_URL,
  OFFSCREEN_PATH,
  PORT_NAME_CONTENT,
  PORT_NAME_OFFSCREEN,
  PORT_NAME_POPUP,
} from '../shared/constants.js';
import { getSettings } from '../shared/settings.js';
import {
  DEFAULT_PERMISSIONS,
  getPermissions,
  grantOrigin,
  isWithinRevokeCooldown,
  revokeAll,
  revokeOrigin,
  subscribePermissions,
  syncAccountsWithCanonical,
  type PermissionsState,
} from '../shared/permissions.js';
import { checkOrigin } from '../shared/phishing.js';
import type { AnyMessage, WindowClose, WindowOpen, WindowPostMessage } from '../shared/messages.js';

// ---------- Offscreen document lifecycle ----------

let offscreenReadyResolve: (() => void) | null = null;
let offscreenReadyReject: ((err: unknown) => void) | null = null;
let offscreenReadyPromise: Promise<void> | null = null;

async function ensureOffscreen(): Promise<void> {
  if (offscreenReadyPromise) return offscreenReadyPromise;

  offscreenReadyPromise = new Promise<void>((resolve, reject) => {
    offscreenReadyResolve = resolve;
    offscreenReadyReject = reject;
  });

  try {
    if (!(await hasOffscreenDocument())) {
      // Offscreen documents don't have access to chrome.storage in many Chrome
      // versions (only chrome.runtime + chrome.offscreen). Read settings here
      // in the service worker (where storage IS available) and pass them via
      // URL params. Offscreen parses its own location.search at boot.
      const settings = await getSettings();
      const params = new URLSearchParams();
      if (settings.showTestnets !== null) params.set('showTestnets', String(settings.showTestnets));
      if (settings.defaultChainId !== null) params.set('defaultChainId', String(settings.defaultChainId));
      const url = params.toString() ? `${OFFSCREEN_PATH}?${params.toString()}` : OFFSCREEN_PATH;
      await chrome.offscreen.createDocument({
        url,
        reasons: [
          chrome.offscreen.Reason.IFRAME_SCRIPTING,
          chrome.offscreen.Reason.DOM_PARSER,
          chrome.offscreen.Reason.LOCAL_STORAGE,
        ],
        justification: 'Hosts the JAW SDK; needs DOM, localStorage, and a real DOM context for cryptography',
      });
    }
  } catch (err) {
    const msg = (err as Error).message ?? '';
    // Tolerate the duplicate-document error from racing creators.
    if (!msg.includes('Only a single offscreen document') && !msg.includes('already exists')) {
      const reject = offscreenReadyReject;
      offscreenReadyPromise = null;
      offscreenReadyResolve = null;
      offscreenReadyReject = null;
      reject?.(err);
      throw err;
    }
    // Duplicate-document path: the race winner owns the connect callback. If
    // that callback already fired before we got here, `offscreenReadyResolve`
    // would never be invoked again and the promise hangs forever, orphaning
    // every pending RPC until SW idle-kill. Force-check after a short delay
    // and self-resolve if the offscreen is alive; reject if it isn't, so we
    // can never end up with a non-null promise that nothing will ever settle.
    setTimeout(async () => {
      if (!offscreenReadyResolve) return;
      if (await hasOffscreenDocument()) {
        offscreenReadyResolve();
        offscreenReadyResolve = null;
        offscreenReadyReject = null;
      } else {
        const reject = offscreenReadyReject;
        offscreenReadyPromise = null;
        offscreenReadyResolve = null;
        offscreenReadyReject = null;
        reject?.(new Error('Offscreen document not found after duplicate-create race'));
      }
    }, 500);
  }

  return offscreenReadyPromise;
}

async function hasOffscreenDocument(): Promise<boolean> {
  if (typeof chrome.runtime.getContexts === 'function') {
    const contexts = await chrome.runtime.getContexts({
      contextTypes: [chrome.runtime.ContextType.OFFSCREEN_DOCUMENT],
    });
    return contexts.length > 0;
  }
  return false;
}

// ---------- Port registry ----------

interface ContentPortRegistration {
  port: chrome.runtime.Port;
  tabId: number;
  origin?: string;
}

const contentPorts: Map<number, ContentPortRegistration> = new Map();
const popupPorts: Set<chrome.runtime.Port> = new Set();
let offscreenPort: chrome.runtime.Port | null = null;

interface RequestOriginContent {
  kind: 'content';
  tabId: number;
  expiresAt: number;
}
interface RequestOriginPopup {
  kind: 'popup';
  expiresAt: number;
}
type RequestOrigin = RequestOriginContent | RequestOriginPopup;
const requestOrigins: Map<string, RequestOrigin> = new Map();
const REQUEST_TTL_MS = 5 * 60 * 1000;

// Sweep of stale request origins is driven by `chrome.alarms` because MV3 service
// workers suspend (any setInterval would die with them). The per-request
// timeout in inpage.ts is the user-facing safety net; this sweep just frees
// background memory.
// Idempotent alarm registration — service workers respawn frequently and
// `create` with an existing name resets the timer; check first.
chrome.alarms.get('jaw-sweep').then((existing) => {
  if (!existing) chrome.alarms.create('jaw-sweep', { periodInMinutes: 1 });
});
chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name !== 'jaw-sweep') return;
  const now = Date.now();
  for (const [id, origin] of requestOrigins) {
    if (origin.expiresAt < now) {
      requestOrigins.delete(id);
      sendErrorToOrigin(origin, id, { code: -32603, message: 'Request timed out' });
    }
  }
});

function sendErrorToOrigin(origin: RequestOrigin, id: string, error: { code: number; message: string }): void {
  const msg: AnyMessage = { kind: 'rpc-response', id, error };
  if (origin.kind === 'content') {
    contentPorts.get(origin.tabId)?.port.postMessage(msg);
  } else {
    for (const port of popupPorts) port.postMessage(msg);
  }
}

// ---------- Per-origin permissions (EIP-2255) ----------
//
// In-memory cache mirrors chrome.storage.local["jaw.permissions"]. We sync via
// storage.onChanged so reads in the hot RPC path stay synchronous. Background
// is the single policy enforcement point — offscreen/content/popup never see
// the table directly.

let permissionsCache: PermissionsState = { ...DEFAULT_PERMISSIONS };
let permissionsReady: Promise<void> | null = null;

function ensurePermissionsLoaded(): Promise<void> {
  if (permissionsReady) return permissionsReady;
  permissionsReady = getPermissions().then((s) => {
    permissionsCache = s;
  });
  return permissionsReady;
}
void ensurePermissionsLoaded();
subscribePermissions((next, prev) => {
  permissionsCache = next;
  for (const origin of Object.keys(prev.origins)) {
    const wasPermitted = (prev.origins[origin]?.accounts.length ?? 0) > 0;
    const stillPermitted = (next.origins[origin]?.accounts.length ?? 0) > 0;
    if (wasPermitted && !stillPermitted) {
      notifyOriginRevoked(origin);
    }
  }
});

function notifyOriginRevoked(origin: string): void {
  // Path 1: post over any currently-live long-lived port. This is the fast
  // path when the SW + content port are healthy.
  for (const reg of contentPorts.values()) {
    if (reg.origin !== origin) continue;
    try {
      reg.port.postMessage({ kind: 'provider-event', event: 'accountsChanged', payload: [] });
      reg.port.postMessage({
        kind: 'provider-event',
        event: 'disconnect',
        payload: { code: 4900, message: 'Disconnected by user from JAW extension' },
      });
    } catch {
      /* port may be closed */
    }
  }
  // Path 2: broadcast via chrome.tabs.sendMessage. This reaches the
  // content script's chrome.runtime.onMessage listener regardless of
  // long-lived-port state — survives SW suspension/respawn and idle dApp
  // tabs whose port was torn down. We don't have `tabs` permission so
  // tab.url isn't readable here; we send to every tab and let each
  // content script filter by `window.location.origin === message.origin`.
  void chrome.tabs
    .query({})
    .then((tabs) => {
      const events: AnyMessage[] = [
        { kind: 'provider-event', event: 'accountsChanged', payload: [] },
        {
          kind: 'provider-event',
          event: 'disconnect',
          payload: { code: 4900, message: 'Disconnected by user from JAW extension' },
        },
      ];
      for (const tab of tabs) {
        if (typeof tab.id !== 'number') continue;
        // sendMessage to tabs without a content script throws "no receiving
        // end". That's expected — swallow it.
        chrome.tabs.sendMessage(tab.id, { kind: 'jaw-push-events', origin, events }).catch(() => undefined);
      }
    })
    .catch(() => undefined);
}

function isOriginPermittedSync(origin: string | undefined): boolean {
  if (!origin) return false;
  const entry = permissionsCache.origins[origin];
  return !!entry && entry.accounts.length > 0;
}

function accountsForOriginSync(origin: string | undefined): string[] {
  if (!origin) return [];
  return permissionsCache.origins[origin]?.accounts ?? [];
}

// Methods that MUTATE wallet state or sign on the user's behalf. Must require
// prior eth_requestAccounts approval from the calling origin.
const SIGNING_METHODS: ReadonlySet<string> = new Set([
  'personal_sign',
  'eth_sign',
  'eth_signTypedData',
  'eth_signTypedData_v1',
  'eth_signTypedData_v3',
  'eth_signTypedData_v4',
  'eth_sendTransaction',
  'wallet_sendCalls',
  'wallet_sign',
  'wallet_grantPermissions',
  'wallet_revokePermissions',
  'wallet_switchEthereumChain',
  'wallet_watchAsset',
]);

// Methods that establish a connection. Background intercepts the response and
// records the origin in the permissions table on success.
const GRANT_METHODS: ReadonlySet<string> = new Set([
  'eth_requestAccounts',
  'wallet_connect',
  'wallet_requestPermissions',
]);

// Tracks which in-flight RPCs are grant flows so we can intercept the
// response and write to the permissions table.
const pendingGrants: Map<string, string> = new Map();

// Origins that just completed a grant flow. The dApp's wagmi connector already
// processed `wallet_connect` / `eth_requestAccounts` and emitted its own
// "connect" — re-emitting the SDK's connect event to that port within this
// window thrashes wagmi's state machine. We suppress the redundant SDK-side
// connect event only; accountsChanged still flows so corrections propagate.
// Symptom this fixes: Uniswap's React tree throws on `accounts[0].address`
// because the duplicate connect triggers a re-render before account state
// settles. See ConnectedDapps.tsx for the popup-side analog.
const recentlyGrantedOrigins: Map<string, number> = new Map();
const CONNECT_DEDUPE_WINDOW_MS = 3_000;

// EIP-1193 error codes used by the gate.
const ERR_UNAUTHORIZED = { code: 4100, message: 'Unauthorized: call eth_requestAccounts first' };
const ERR_INVALID_ORIGIN = { code: 4100, message: 'Cannot determine request origin' };

function sendLocalResponse(port: chrome.runtime.Port, id: string, result: unknown): void {
  try {
    port.postMessage({ kind: 'rpc-response', id, result });
  } catch {
    /* port may have disconnected */
  }
}

function sendLocalError(port: chrome.runtime.Port, id: string, error: { code: number; message: string }): void {
  try {
    port.postMessage({ kind: 'rpc-response', id, error });
  } catch {
    /* port may have disconnected */
  }
}

function emitLocalEvent(port: chrome.runtime.Port, event: string, payload: unknown): void {
  try {
    port.postMessage({ kind: 'provider-event', event, payload });
  } catch {
    /* port may have disconnected */
  }
}

// EIP-2255 shape returned from wallet_getPermissions.
function buildEip2255Permissions(accounts: string[]): unknown[] {
  if (accounts.length === 0) return [];
  return [
    {
      invoker: undefined, // origin is implicit per-port; included on the dApp side
      parentCapability: 'eth_accounts',
      caveats: [{ type: 'restrictReturnedAccounts', value: accounts }],
    },
  ];
}

/**
 * Pulls account addresses out of whatever shape a grant flow returned:
 *   eth_requestAccounts        → `string[]`
 *   wallet_connect             → `{ accounts: [{ address }, …] }`
 *   wallet_requestPermissions  → EIP-2255 permission array with `restrictReturnedAccounts` caveat
 */
function extractAccountsFromGrantResult(result: unknown): string[] {
  if (Array.isArray(result)) {
    // string[] (eth_requestAccounts) OR EIP-2255 permission[] (wallet_requestPermissions)
    if (result.every((x) => typeof x === 'string')) return result as string[];
    const fromCaveats: string[] = [];
    for (const perm of result) {
      const caveats = (perm as { caveats?: Array<{ type?: string; value?: unknown }> }).caveats;
      if (!Array.isArray(caveats)) continue;
      for (const c of caveats) {
        if (c?.type === 'restrictReturnedAccounts' && Array.isArray(c.value)) {
          for (const v of c.value) if (typeof v === 'string') fromCaveats.push(v);
        }
      }
    }
    return fromCaveats;
  }
  if (result && typeof result === 'object') {
    const accounts = (result as { accounts?: unknown }).accounts;
    if (Array.isArray(accounts)) {
      const out: string[] = [];
      for (const entry of accounts) {
        if (typeof entry === 'string') out.push(entry);
        else if (entry && typeof entry === 'object') {
          const addr = (entry as { address?: unknown }).address;
          if (typeof addr === 'string') out.push(addr);
        }
      }
      return out;
    }
  }
  return [];
}

// ---------- Bridged keys.jaw.id popup window ----------

interface BridgedWindow {
  windowId: number;
  tabId: number;
  origin?: string;
  // The offscreen port that owns this window (where messages are forwarded to).
  ownerPort: chrome.runtime.Port;
  ownerWindowId: string;
  // Origin of the dApp tab that triggered this signing popup. Sourced from the
  // trusted port.sender layer (never the in-page provider, which EIP-1193
  // explicitly warns is adversary-controlled). Injected into the SDK handshake
  // so keys.jaw.id displays the real dApp instead of `chrome-extension://...`.
  dappOrigin?: string;
}
const bridgedWindows: Map<string, BridgedWindow> = new Map(); // ownerWindowId → BridgedWindow

// Toolbar badge — shows a count of open signing popups so the user has a
// visual cue when keys.jaw.id is awaiting their action. Refreshed whenever
// the bridged-window set changes.
function refreshActionBadge(): void {
  const count = bridgedWindows.size;
  const text = count === 0 ? '' : String(count);
  try {
    chrome.action.setBadgeText({ text });
    if (count > 0) {
      chrome.action.setBadgeBackgroundColor({ color: '#f59e0b' });
    }
  } catch {
    /* badge APIs not critical to wallet function */
  }
}

function resolveDappOriginForRpc(rpcId: string | undefined): string | undefined {
  if (!rpcId) return undefined;
  const reqOrigin = requestOrigins.get(rpcId);
  if (reqOrigin?.kind !== 'content') return undefined;
  return contentPorts.get(reqOrigin.tabId)?.origin;
}

async function openBridgedWindow(req: WindowOpen, ownerPort: chrome.runtime.Port): Promise<void> {
  try {
    const win = await chrome.windows.create({
      url: req.url,
      type: 'popup',
      width: 420,
      height: 730,
      focused: true,
    });
    if (!win.id || !win.tabs?.[0]?.id) {
      throw new Error('Window creation returned no id');
    }
    const url = new URL(req.url);
    const bridged: BridgedWindow = {
      windowId: win.id,
      tabId: win.tabs[0].id,
      origin: url.origin,
      ownerPort,
      ownerWindowId: req.id,
      dappOrigin: resolveDappOriginForRpc(req.rpcId),
    };
    bridgedWindows.set(req.id, bridged);
    refreshActionBadge();
    ownerPort.postMessage({ kind: 'window-open-ack', id: req.id, ok: true });
  } catch (err) {
    ownerPort.postMessage({
      kind: 'window-open-ack',
      id: req.id,
      ok: false,
      error: (err as Error).message,
    });
  }
}

async function closeBridgedWindow(id: string): Promise<void> {
  const bridged = bridgedWindows.get(id);
  if (!bridged) return;
  bridgedWindows.delete(id);
  refreshActionBadge();
  try {
    await chrome.windows.remove(bridged.windowId);
  } catch {
    /* already closed */
  }
}

// Detects the SDK's handshake config message — the only message we rewrite to
// inject the real dApp origin. Other postMessage traffic (encrypted RPCs) is
// forwarded untouched.
//
// Communicator.waitForPopupLoaded ships:
//   { requestId, data: { version, metadata, preference, location } }
// (packages/core/src/communicator/communicator.ts:60-70). `version` only
// appears on this config payload, so it's a safe sentinel.
function isSdkConfigMessage(data: unknown): data is {
  requestId: string;
  data: { version: unknown; location?: string; metadata?: unknown; preference?: unknown };
} {
  if (!data || typeof data !== 'object') return false;
  const inner = (data as { data?: unknown }).data;
  if (!inner || typeof inner !== 'object') return false;
  return 'version' in (inner as Record<string, unknown>);
}

async function postToBridgedWindow(req: WindowPostMessage): Promise<void> {
  const bridged = bridgedWindows.get(req.id);
  if (!bridged) return;
  // Defense-in-depth: refuse to forward unless the SDK targeted the expected
  // keys.jaw.id origin EXACTLY. The bridged window's origin is captured at
  // create time from the validated URL, so it's always known here — there's
  // no legitimate reason to accept `'*'`, which would let a compromised
  // offscreen escape the origin lock-down.
  if (req.targetOrigin !== bridged.origin) {
    console.warn('[JAW] dropped post to bridged window: targetOrigin mismatch', req.targetOrigin);
    return;
  }

  // Standard wallet practice (MetaMask, Coinbase, Rabby): origin attribution
  // is derived from the trusted browser layer (port.sender.origin), never from
  // anything the in-page provider claims (EIP-1193 warns the provider is
  // adversary-controlled). The SDK runs in our offscreen DOM and seeds
  // `location` from `window.location` — i.e. `chrome-extension://<id>/...`.
  // We swap it for the real dApp origin captured at content-port connect time.
  let outgoingData = req.data;
  if (bridged.dappOrigin && isSdkConfigMessage(req.data)) {
    const original = req.data;
    outgoingData = {
      ...original,
      data: { ...original.data, location: bridged.dappOrigin },
    };
  }

  try {
    await chrome.tabs.sendMessage(bridged.tabId, {
      kind: 'jaw-bridge-to-window',
      data: outgoingData,
      targetOrigin: req.targetOrigin,
    });
  } catch (err) {
    console.error('[JAW] post to bridged window failed', err);
  }
}

chrome.windows.onRemoved.addListener((windowId) => {
  for (const [id, bridged] of bridgedWindows) {
    if (bridged.windowId === windowId) {
      bridgedWindows.delete(id);
      refreshActionBadge();
      try {
        bridged.ownerPort.postMessage({ kind: 'window-closed', id });
      } catch {
        /* port may be closed */
      }
    }
  }
});

// Allowed origin from the build-time constant. Production builds set this to
// `https://keys.jaw.id`; dev builds may set `http://localhost:3001`.
function buildKeysOrigin(): string {
  try {
    return new URL(JAW_KEYS_URL).origin;
  } catch {
    return 'https://keys.jaw.id';
  }
}
const KEYS_ALLOWED_ORIGIN = buildKeysOrigin();

// Popup → SW revoke routing. ConnectedDapps' ✕ button sends this so the
// write happens in the SW context (single permission write queue), defeating
// races with concurrent grantOrigin calls from the dApp's session-refresh
// wallet_connect. Returns `true` to keep the message channel open for the
// async response.
chrome.runtime.onMessage.addListener((message: unknown, sender, sendResponse) => {
  const m = message as { kind?: string; origin?: string } | null;
  if (m?.kind === 'jaw-revoke-origin' && typeof m.origin === 'string') {
    // Only allow from the extension's own popup/options pages. `sender.id`
    // alone is satisfied by any extension context including content scripts,
    // so a compromised content script could force-disconnect any origin.
    // Popups have no associated tab; content scripts always do.
    if (sender.id !== chrome.runtime.id || sender.tab) {
      sendResponse({ ok: false, error: 'unauthorized' });
      return false;
    }
    // Notify the dApp DIRECTLY and IMMEDIATELY — don't wait for the storage
    // write to commit and the storage.onChanged event to propagate back
    // through subscribePermissions. That path had subtle timing quirks (the
    // newValue sometimes arrived as the pre-tombstone state) that we don't
    // fully understand. Direct notify is deterministic: the moment the user
    // clicks ✕, the dApp gets accountsChanged:[] + disconnect via both
    // long-lived port AND chrome.tabs.sendMessage broadcast.
    notifyOriginRevoked(m.origin);
    void revokeOrigin(m.origin)
      .then(() => sendResponse({ ok: true }))
      .catch((err) => sendResponse({ ok: false, error: String(err) }));
    return true; // async response
  }
  return false;
});

// Receive messages from the keys.jaw.id bridge content script and forward them
// to the offscreen port that owns the bridged window. Synchronous response —
// no `return true` (which would hold the channel open for 30s).
chrome.runtime.onMessage.addListener((message: unknown, sender, sendResponse) => {
  const msg = message as { kind?: string; data?: unknown; origin?: string } | null;
  if (!msg || msg.kind !== 'jaw-bridge-from-window') return false;
  if (sender.origin !== KEYS_ALLOWED_ORIGIN) {
    console.warn(
      '[JAW bg] rejected bridge message from unauthorized origin',
      sender.origin,
      'expected',
      KEYS_ALLOWED_ORIGIN
    );
    return false;
  }
  const tabId = sender.tab?.id;
  if (typeof tabId !== 'number') return false;
  for (const [id, bridged] of bridgedWindows) {
    if (bridged.tabId === tabId) {
      try {
        bridged.ownerPort.postMessage({
          kind: 'window-incoming-message',
          id,
          data: msg.data,
          // Use the SW-owned origin captured at window-create time from the
          // validated URL — never trust the origin field supplied by the
          // content-script payload, since a compromised page MAIN world
          // could spoof it. The check at sender.origin already authenticated
          // the tab; this guarantees the forwarded value is the same one.
          origin: bridged.origin,
        });
      } catch (err) {
        console.error('[JAW bg] offscreen post failed', err);
      }
      sendResponse({ ok: true });
      return false;
    }
  }
  console.warn('[JAW bg] no bridged window for tab', tabId, 'known:', [...bridgedWindows.keys()]);
  return false;
});

// ---------- Connection handler ----------

chrome.runtime.onConnect.addListener((port) => {
  if (port.name === PORT_NAME_CONTENT) handleContentPort(port);
  else if (port.name === PORT_NAME_OFFSCREEN) handleOffscreenPort(port);
  else if (port.name === PORT_NAME_POPUP) handlePopupPort(port);
});

function handleContentPort(port: chrome.runtime.Port): void {
  const tabId = port.sender?.tab?.id;
  const origin = port.sender?.origin ?? port.sender?.url;
  if (typeof tabId !== 'number') {
    port.disconnect();
    return;
  }
  const reg: ContentPortRegistration = { port, tabId, origin };
  contentPorts.set(tabId, reg);

  // Audit CRITICAL-2 part B: when a content port (re)connects, replay any
  // disconnect events that were missed while the port was down (e.g. the
  // user clicked ✕ in the popup during a SW suspension, or the dApp tab
  // was just opened on a previously-revoked origin). Without this, the
  // dApp's wagmi continues to believe it's connected until manual refresh.
  void (async () => {
    await ensurePermissionsLoaded();
    if (!origin) return;
    const entry = permissionsCache.origins[origin];
    if (entry && entry.accounts.length === 0 && typeof entry.revokedAt === 'number') {
      try {
        port.postMessage({ kind: 'provider-event', event: 'accountsChanged', payload: [] });
        port.postMessage({
          kind: 'provider-event',
          event: 'disconnect',
          payload: { code: 4900, message: 'Disconnected by user from JAW extension' },
        });
      } catch {
        /* port may already be closed */
      }
    }
  })();

  port.onMessage.addListener(async (message: AnyMessage) => {
    if (message.kind !== 'rpc-request') return;
    // Wait for the permission cache to load before applying the gate. First
    // RPC after a fresh SW boot would otherwise miss the table.
    await ensurePermissionsLoaded();
    await routeContentRpc(reg, message);
  });

  port.onDisconnect.addListener(() => {
    contentPorts.delete(tabId);
  });
}

async function routeContentRpc(
  reg: ContentPortRegistration,
  message: { kind: 'rpc-request'; id: string; method: string; params?: unknown }
): Promise<void> {
  const origin = reg.origin;
  const method = message.method;
  const id = message.id;

  if (!origin) {
    sendLocalError(reg.port, id, ERR_INVALID_ORIGIN);
    return;
  }

  // Locally-served reads — no offscreen roundtrip, no SDK touch.
  if (method === 'eth_accounts') {
    sendLocalResponse(reg.port, id, accountsForOriginSync(origin));
    // NOTE: touchOrigin was removed from this hot path. wagmi polls
    // eth_accounts constantly — a concurrent touchOrigin's read-modify-write
    // was racing with the popup's revokeOrigin write and CLOBBERING the
    // tombstone (last-write-wins). The popup's revoke would silently get
    // undone within ~50ms of the click.
    return;
  }
  if (method === 'wallet_getPermissions') {
    sendLocalResponse(reg.port, id, buildEip2255Permissions(accountsForOriginSync(origin)));
    return;
  }
  // Per-origin disconnect: inpage rewrites `wallet_revokePermissions([{eth_accounts:{}}])`
  // to `wallet_disconnect`, so a dApp calling either lands here. We revoke
  // THIS origin only and emit local disconnect events — the SDK session stays
  // alive for any other dApps still connected.
  if (method === 'wallet_disconnect') {
    await revokeOrigin(origin);
    emitLocalEvent(reg.port, 'accountsChanged', []);
    emitLocalEvent(reg.port, 'disconnect', { code: 4900, message: 'Disconnected' });
    sendLocalResponse(reg.port, id, null);
    return;
  }

  // Public chain info — fine to expose without prior consent (matches MetaMask).
  if (method === 'eth_chainId' || method === 'net_version') {
    forwardToOffscreen(reg, message);
    return;
  }

  // Phishing check — gate grant and signing methods. Reads stay open because
  // a suspicious origin can already learn chain state from any public RPC;
  // we only restrict the user's signing decisions and connection.
  if (GRANT_METHODS.has(method) || SIGNING_METHODS.has(method)) {
    const verdict = checkOrigin(origin);
    if (verdict.suspicious) {
      sendLocalError(reg.port, id, {
        code: 4001,
        message: `Phishing protection: ${verdict.reason ?? 'Origin flagged as suspicious.'} JAW will not sign on this site.`,
      });
      return;
    }
  }

  // Grant flows (eth_requestAccounts, wallet_connect, wallet_requestPermissions):
  // forward to the SDK, then on success record the origin in the permissions
  // table via the offscreen response interceptor. SDK does the passkey ceremony.
  if (GRANT_METHODS.has(method)) {
    // Cooldown after a user-initiated revoke: wagmi's autoConnect fires on
    // page refresh almost immediately. If we silent-granted here, the dApp
    // would re-connect within a second of the user clicking ✕ in the popup
    // — the revoke would feel broken. Reject cleanly during the cooldown
    // (applies to all three GRANT_METHODS) so the dApp's wagmi state stays
    // disconnected.
    if (isWithinRevokeCooldown(permissionsCache, origin)) {
      sendLocalError(reg.port, id, {
        code: 4001,
        message: 'JAW: connection request rejected (recently disconnected by the user).',
      });
      return;
    }
    pendingGrants.set(id, origin);
    forwardToOffscreen(reg, message);
    return;
  }

  // Mutating methods — require prior eth_requestAccounts.
  if (SIGNING_METHODS.has(method)) {
    if (!isOriginPermittedSync(origin)) {
      sendLocalError(reg.port, id, ERR_UNAUTHORIZED);
      return;
    }
    forwardToOffscreen(reg, message);
    return;
  }

  // Everything else (eth_call, eth_getBalance, wallet_getCapabilities, etc.):
  // permitted origins only. Read methods could be considered public, but
  // forwarding without a connection lets dApps bypass eth_requestAccounts and
  // still get useful state. Keep the gate tight.
  if (!isOriginPermittedSync(origin)) {
    sendLocalError(reg.port, id, ERR_UNAUTHORIZED);
    return;
  }
  forwardToOffscreen(reg, message);
}

function forwardToOffscreen(
  reg: ContentPortRegistration,
  message: { kind: 'rpc-request'; id: string; method: string; params?: unknown }
): void {
  requestOrigins.set(message.id, {
    kind: 'content',
    tabId: reg.tabId,
    expiresAt: Date.now() + REQUEST_TTL_MS,
  });
  ensureOffscreen()
    .then(() => {
      // ensureOffscreen can resolve with `offscreenPort` already disconnected
      // if the offscreen died between `await` and this microtask. postMessage
      // on a closed port throws synchronously — clean up both maps so a
      // pending grant doesn't write a stale origin if a future RPC reuses
      // the (statistically impossible but harmless to guard) id.
      try {
        offscreenPort?.postMessage(message);
      } catch (err) {
        reg.port.postMessage({
          kind: 'rpc-response',
          id: message.id,
          error: { code: -32603, message: `Lost connection to signer: ${(err as Error).message}` },
        });
        requestOrigins.delete(message.id);
        pendingGrants.delete(message.id);
      }
    })
    .catch((err: unknown) => {
      reg.port.postMessage({
        kind: 'rpc-response',
        id: message.id,
        error: { code: -32603, message: `Failed to start signer: ${(err as Error).message}` },
      });
      requestOrigins.delete(message.id);
      pendingGrants.delete(message.id);
    });
}

function handleOffscreenPort(port: chrome.runtime.Port): void {
  offscreenPort = port;
  if (offscreenReadyResolve) {
    offscreenReadyResolve();
    offscreenReadyResolve = null;
  }
  port.onMessage.addListener((message: AnyMessage) => {
    if (message.kind === 'rpc-response') {
      const requestOrigin = requestOrigins.get(message.id);
      requestOrigins.delete(message.id);
      // Grant interceptor: if this response completes a grant flow and
      // returned accounts, write the origin to the permissions table.
      const grantOriginUrl = pendingGrants.get(message.id);
      let grantedAccounts: string[] = [];
      if (grantOriginUrl) {
        pendingGrants.delete(message.id);
        if (!message.error) {
          grantedAccounts = extractAccountsFromGrantResult(message.result);
          if (grantedAccounts.length > 0) {
            void grantOrigin(grantOriginUrl, grantedAccounts);
            // Mark origin to suppress the SDK's redundant connect event
            // that arrives milliseconds later — wagmi already processed
            // this grant via the wallet_connect result.
            recentlyGrantedOrigins.set(grantOriginUrl, Date.now());
          }
        }
      }
      if (!requestOrigin) return;
      if (requestOrigin.kind === 'content') {
        const targetPort = contentPorts.get(requestOrigin.tabId)?.port;
        if (targetPort) {
          // Warm the inpage cache BEFORE the grant response so any
          // synchronous `eth_accounts` read inside the dApp's connect
          // useMemo sees a populated array, not undefined. Fixes Uniswap's
          // `Cannot read properties of undefined (reading 'address')`.
          if (grantedAccounts.length > 0) {
            emitLocalEvent(targetPort, 'accountsChanged', grantedAccounts);
          }
          targetPort.postMessage(message);
        }
      } else {
        for (const p of popupPorts) p.postMessage(message);
      }
      return;
    }
    if (message.kind === 'provider-event') {
      // Fan-out is scoped per EIP-1193 semantics:
      //   chainChanged: global (chain is a single global concept)
      //   accountsChanged / connect / disconnect: only to origins with permission
      //
      // For accountsChanged we must reconcile permissions BEFORE fan-out so
      // an origin that just lost its account doesn't briefly see the canonical
      // event before its own disconnect (BLOCKING-2). We await the sync and
      // update permissionsCache synchronously from its return value so the
      // subsequent gate checks read post-sync state.
      void (async () => {
        if (message.event === 'accountsChanged' && Array.isArray(message.payload)) {
          try {
            const synced = await syncAccountsWithCanonical(message.payload as string[]);
            permissionsCache = synced;
          } catch (err) {
            // If the sync write throws, the fan-out continues with the
            // pre-sync cache. Logging is enough — losing the cache update
            // for one event is preferable to dropping the fan-out entirely.
            console.error('[JAW bg] syncAccountsWithCanonical failed', err);
          }
        }
        // chainChanged is broadcast to every dApp (chain is global).
        // disconnect is broadcast to every dApp too — audit CRITICAL-3:
        // after a lock-all (`revokeAll`) every origin is tombstoned so
        // `isOriginPermittedSync` would always be false, dropping the
        // SDK's disconnect event silently. Broadcasting unconditionally
        // ensures dApps always learn when the wallet locks.
        const broadcastToAll = message.event === 'chainChanged' || message.event === 'disconnect';
        const now = Date.now();
        for (const reg of contentPorts.values()) {
          if (!(broadcastToAll || isOriginPermittedSync(reg.origin))) continue;
          // Suppress the SDK's `connect` event echo to origins that just
          // received a grant response — wagmi already processed it.
          if (message.event === 'connect') {
            const grantedAt = recentlyGrantedOrigins.get(reg.origin);
            if (typeof grantedAt === 'number' && now - grantedAt < CONNECT_DEDUPE_WINDOW_MS) {
              continue;
            }
          }
          try {
            reg.port.postMessage(message);
          } catch {
            /* port may be closed */
          }
        }
        // Sweep stale entries on every provider-event. The map is small
        // (one entry per recently-granted origin) and the loop is O(n) over
        // a tiny collection. Sweeping unconditionally avoids the "size-gated
        // GC never runs in long sessions with <N origins" trap.
        for (const [origin, ts] of recentlyGrantedOrigins) {
          if (now - ts >= CONNECT_DEDUPE_WINDOW_MS) recentlyGrantedOrigins.delete(origin);
        }
        for (const p of popupPorts) {
          try {
            p.postMessage(message);
          } catch {
            /* port may be closed */
          }
        }
      })();
      return;
    }
    if (message.kind === 'status-response') {
      for (const p of popupPorts) p.postMessage(message);
      return;
    }
    if (message.kind === 'window-open') {
      void openBridgedWindow(message, port);
      return;
    }
    if (message.kind === 'window-post-message') {
      void postToBridgedWindow(message);
      return;
    }
    if (message.kind === 'window-close') {
      void closeBridgedWindow((message as WindowClose).id);
      return;
    }
  });
  port.onDisconnect.addListener(() => {
    if (offscreenPort === port) offscreenPort = null;
    // Reject any callers still suspended on the readiness promise so they
    // don't hang forever when the offscreen disconnects mid-handshake.
    const reject = offscreenReadyReject;
    offscreenReadyPromise = null;
    offscreenReadyResolve = null;
    offscreenReadyReject = null;
    reject?.(new Error('Offscreen disconnected'));
    // Any request still pending is now orphaned; surface an error.
    for (const [id, origin] of requestOrigins) {
      requestOrigins.delete(id);
      sendErrorToOrigin(origin, id, { code: -32603, message: 'Signer disconnected' });
    }
    // Clear grant interceptor map too. Without this, an orphaned grant id
    // would linger across SW restarts (HIGH-3); statistically harmless given
    // crypto.randomUUID() id generation but it's a real memory leak.
    pendingGrants.clear();
    // Close any windows owned by this offscreen instance.
    for (const [id, bridged] of bridgedWindows) {
      if (bridged.ownerPort === port) {
        bridgedWindows.delete(id);
        chrome.windows.remove(bridged.windowId).catch(() => undefined);
      }
    }
    refreshActionBadge();
  });
}

function handlePopupPort(port: chrome.runtime.Port): void {
  popupPorts.add(port);
  port.onMessage.addListener(async (message: AnyMessage) => {
    if (message.kind === 'status-request') {
      try {
        await ensureOffscreen();
        offscreenPort?.postMessage(message);
      } catch {
        port.postMessage({
          kind: 'status-response',
          id: message.id,
          connected: false,
          accounts: [],
          chainId: null,
        });
      }
      return;
    }
    if (message.kind === 'rpc-request') {
      // Popup-initiated wallet_disconnect = the user's explicit "lock
      // everything" gesture. Audit MEDIUM-1: don't rely solely on the
      // async storage-diff path to notify dApps — that path can lose
      // events when the SW just woke (CRITICAL-1) or when the content
      // port was disconnected (CRITICAL-2). Snapshot the currently-
      // permitted origins BEFORE revokeAll wipes them and directly emit
      // events on each live port. revokeAll then tombstones for the
      // cooldown; the storage-diff path acts as a belt-and-suspenders
      // fallback if a port reconnects later.
      if (message.method === 'wallet_disconnect') {
        const permittedOrigins = Object.entries(permissionsCache.origins)
          .filter(([, e]) => e.accounts.length > 0)
          .map(([o]) => o);
        for (const origin of permittedOrigins) {
          notifyOriginRevoked(origin);
        }
        await revokeAll();
      }
      requestOrigins.set(message.id, { kind: 'popup', expiresAt: Date.now() + REQUEST_TTL_MS });
      try {
        await ensureOffscreen();
        offscreenPort?.postMessage(message);
      } catch (err) {
        port.postMessage({
          kind: 'rpc-response',
          id: message.id,
          error: { code: -32603, message: `Failed to start signer: ${(err as Error).message}` },
        });
        requestOrigins.delete(message.id);
      }
    }
  });
  port.onDisconnect.addListener(() => {
    popupPorts.delete(port);
  });
}

chrome.runtime.onInstalled.addListener((details) => {
  ensureOffscreen().catch((err) => console.error('[JAW] offscreen init failed', err));
  // Open the onboarding page on FIRST install only — not on update or browser
  // restart. Matches MetaMask / Rabby convention; gives users a clear entry
  // point to create / import their JAW account.
  if (details.reason === 'install') {
    chrome.tabs.create({ url: JAW_KEYS_URL }).catch(() => undefined);
  }
});
chrome.runtime.onStartup.addListener(() => {
  ensureOffscreen().catch((err) => console.error('[JAW] offscreen init failed', err));
});
