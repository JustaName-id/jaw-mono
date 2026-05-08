import {
  JAW_KEYS_URL,
  OFFSCREEN_PATH,
  PORT_NAME_CONTENT,
  PORT_NAME_OFFSCREEN,
  PORT_NAME_POPUP,
} from '../shared/constants.js';
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
      await chrome.offscreen.createDocument({
        url: OFFSCREEN_PATH,
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
  // keys.jaw.id origin (or '*'). Prevents an unexpected targetOrigin from
  // causing PopupCommunicator to lock to a different origin.
  if (req.targetOrigin !== '*' && req.targetOrigin !== bridged.origin) {
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
      console.log('[JAW bg] forwarding to offscreen, windowId', id);
      try {
        bridged.ownerPort.postMessage({
          kind: 'window-incoming-message',
          id,
          data: msg.data,
          origin: msg.origin ?? '',
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

  port.onMessage.addListener(async (message: AnyMessage) => {
    if (message.kind === 'rpc-request') {
      requestOrigins.set(message.id, {
        kind: 'content',
        tabId,
        expiresAt: Date.now() + REQUEST_TTL_MS,
      });
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
    contentPorts.delete(tabId);
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
      const origin = requestOrigins.get(message.id);
      requestOrigins.delete(message.id);
      if (!origin) return;
      if (origin.kind === 'content') {
        contentPorts.get(origin.tabId)?.port.postMessage(message);
      } else {
        for (const p of popupPorts) p.postMessage(message);
      }
      return;
    }
    if (message.kind === 'provider-event') {
      for (const reg of contentPorts.values()) reg.port.postMessage(message);
      for (const p of popupPorts) p.postMessage(message);
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
    // Close any windows owned by this offscreen instance.
    for (const [id, bridged] of bridgedWindows) {
      if (bridged.ownerPort === port) {
        bridgedWindows.delete(id);
        chrome.windows.remove(bridged.windowId).catch(() => undefined);
      }
    }
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

chrome.runtime.onInstalled.addListener(() => {
  ensureOffscreen().catch((err) => console.error('[JAW] offscreen init failed', err));
});
chrome.runtime.onStartup.addListener(() => {
  ensureOffscreen().catch((err) => console.error('[JAW] offscreen init failed', err));
});
