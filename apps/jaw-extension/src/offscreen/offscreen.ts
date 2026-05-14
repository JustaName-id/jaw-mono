/**
 * The JAW SDK was designed to run inside a normal page context. In MV3,
 * Chrome blocks `window.open` from offscreen documents (no user gesture
 * propagation), so we install a `window.open` shim that delegates to the
 * background service worker. The background opens the popup via
 * `chrome.windows.create` and bridges postMessage traffic both ways.
 *
 * IMPORTANT: this override must run BEFORE we import `@jaw.id/core`, because
 * the SDK captures `window.open` at module init time (in some helpers).
 */

import { PORT_NAME_OFFSCREEN } from '../shared/constants.js';
import type { AnyMessage, RpcEnvelope, StatusRequest } from '../shared/messages.js';
import { newId } from '../shared/messages.js';

interface ProxyWindow {
  readonly closed: boolean;
  focus: () => void;
  close: () => void;
  postMessage: (data: unknown, targetOrigin: string) => void;
}

interface ProxyEntry {
  proxy: ProxyWindow;
  origin: string;
  markClosed: () => void;
}
const proxies: Map<string, ProxyEntry> = new Map();

const port = chrome.runtime.connect({ name: PORT_NAME_OFFSCREEN });

// The RPC currently being processed. The window.open shim attaches this to the
// `window-open` envelope so the background can resolve which dApp tab triggered
// the popup and tell keys.jaw.id the real dApp origin.
let currentRpcId: string | undefined;

// Override window.open. Returns a proxy synchronously; the background opens
// the real window asynchronously. Calls before the ack arrive are queued.
const realOpen = window.open.bind(window);
window.open = function patchedOpen(url?: string | URL, target?: string, features?: string): Window | null {
  if (!url) return realOpen(url as string, target, features);
  const initialUrlStr = url instanceof URL ? url.toString() : url;
  let parsedOrigin = '';
  let urlStr = initialUrlStr;
  try {
    const u = new URL(initialUrlStr);
    parsedOrigin = u.origin;
    // Bridge marker — keys-bridge content scripts only activate on URLs that
    // carry this query param, so user-opened keys.jaw.id tabs (e.g. "Manage
    // account") render normally without the synthetic-opener override.
    u.searchParams.set('_jawext', '1');
    urlStr = u.toString();
  } catch {
    return realOpen(url as string, target, features);
  }
  const id = newId();
  let isClosed = false;
  const queued: Array<{ data: unknown; targetOrigin: string }> = [];
  let opened = false;

  const proxy: ProxyWindow = {
    get closed() {
      return isClosed;
    },
    focus: () => {
      /* background already focuses on create */
    },
    close: () => {
      isClosed = true;
      port.postMessage({ kind: 'window-close', id });
    },
    postMessage: (data: unknown, targetOrigin: string) => {
      if (isClosed) return;
      const encoded = encode(data);
      if (!opened) {
        queued.push({ data: encoded, targetOrigin });
        return;
      }
      port.postMessage({ kind: 'window-post-message', id, data: encoded, targetOrigin });
    },
  };

  proxies.set(id, {
    proxy,
    origin: parsedOrigin,
    markClosed: () => {
      isClosed = true;
    },
  });
  port.postMessage({ kind: 'window-open', id, url: urlStr, features, rpcId: currentRpcId });

  // Listen for ack on this id (one-shot)
  const ackHandler = (msg: AnyMessage) => {
    if (msg.kind === 'window-open-ack' && msg.id === id) {
      port.onMessage.removeListener(ackHandler);
      if (msg.ok) {
        opened = true;
        for (const q of queued) {
          port.postMessage({
            kind: 'window-post-message',
            id,
            data: q.data,
            targetOrigin: q.targetOrigin,
          });
        }
        queued.length = 0;
      } else {
        isClosed = true;
        proxies.delete(id);
        console.error('[JAW offscreen] window-open failed:', msg.error);
      }
    }
  };
  port.onMessage.addListener(ackHandler);

  return proxy as unknown as Window;
};

// Forward incoming bridged messages by synthesizing window 'message' events.
port.onMessage.addListener((message: AnyMessage) => {
  if (message.kind === 'window-incoming-message') {
    const proxyEntry = proxies.get(message.id);
    const event = new MessageEvent('message', {
      data: decode(message.data),
      origin: proxyEntry?.origin ?? '',
    });
    window.dispatchEvent(event);
    return;
  }
  if (message.kind === 'window-closed') {
    proxies.get(message.id)?.markClosed();
    proxies.delete(message.id);
    return;
  }
  if (message.kind === 'rpc-request') {
    void handleRpc(message);
    return;
  }
  if (message.kind === 'status-request') {
    void handleStatus(message);
    return;
  }
});

// ---------- SDK setup (must come AFTER window.open override) ----------

let provider: import('@jaw.id/core').ProviderInterface | null = null;

try {
  const { JAW } = await import('@jaw.id/core');
  const { JAW_EXTENSION_API_KEY, JAW_KEYS_URL } = await import('../shared/constants.js');

  // Build-time default for which chains the SDK seeds. Vite gotcha:
  // `import.meta.env.DEV` is `false` during `vite build` even with
  // --mode development; MODE reflects --mode reliably.
  const buildShowTestnets = import.meta.env.MODE === 'development';

  // Settings arrive via URL params because chrome.storage is NOT exposed to
  // offscreen documents in many Chrome versions (a known platform limitation
  // — only chrome.runtime + chrome.offscreen are available). The background
  // service worker reads chrome.storage on our behalf at offscreen-creation
  // time and bakes the user's prefs into the URL.
  const urlParams = new URLSearchParams(window.location.search);
  const showTestnetsParam = urlParams.get('showTestnets');
  const defaultChainIdParam = urlParams.get('defaultChainId');
  const userShowTestnets = showTestnetsParam === null ? null : showTestnetsParam === 'true';
  const userDefaultChainId = defaultChainIdParam === null ? null : Number.parseInt(defaultChainIdParam, 10);

  const sdk = JAW.create({
    apiKey: JAW_EXTENSION_API_KEY,
    appName: 'JAW Extension',
    appLogoUrl: null,
    // User setting overrides build-time default. Falls back to build mode
    // (testnets in dev, mainnet-only in prod) when the user hasn't customized.
    defaultChainId: Number.isFinite(userDefaultChainId as number) ? (userDefaultChainId as number) : undefined,
    preference: {
      keysUrl: JAW_KEYS_URL,
      showTestnets: userShowTestnets ?? buildShowTestnets,
    },
  });

  provider = sdk.provider;

  const eventNames = ['connect', 'disconnect', 'chainChanged', 'accountsChanged'] as const;
  for (const event of eventNames) {
    provider.on(event, (payload: unknown) => {
      safePost({ kind: 'provider-event', event, payload });
    });
  }
} catch (err) {
  console.error('[JAW offscreen] SDK init failed', err);
  // Provider stays null; handleRpc returns init-failed errors to callers
  // rather than letting promises hang forever.
}

async function handleRpc(message: RpcEnvelope): Promise<void> {
  if (!provider) {
    safePost({
      kind: 'rpc-response',
      id: message.id,
      error: { code: -32603, message: 'JAW signer failed to initialize' },
    });
    return;
  }
  // Stack-style save/restore: nested concurrent RPCs would otherwise leak the
  // outer RPC's id to inner window.open calls.
  const previousRpcId = currentRpcId;
  currentRpcId = message.id;
  try {
    const result = await provider.request({ method: message.method, params: message.params });
    safePost({ kind: 'rpc-response', id: message.id, result });
  } catch (err) {
    safePost({ kind: 'rpc-response', id: message.id, error: toRpcError(err) });
  } finally {
    currentRpcId = previousRpcId;
  }
}

async function handleStatus(message: StatusRequest): Promise<void> {
  let accounts: string[] = [];
  let chainId: string | null = null;
  if (!provider) {
    safePost({
      kind: 'status-response',
      id: message.id,
      connected: false,
      accounts: [],
      chainId: null,
    });
    return;
  }
  try {
    accounts = (await provider.request({ method: 'eth_accounts' })) as string[];
  } catch {
    accounts = [];
  }
  try {
    chainId = (await provider.request({ method: 'eth_chainId' })) as string;
  } catch {
    chainId = null;
  }
  safePost({
    kind: 'status-response',
    id: message.id,
    connected: Array.isArray(accounts) && accounts.length > 0,
    accounts: Array.isArray(accounts) ? accounts : [],
    chainId,
  });
}

function toRpcError(err: unknown): { code: number; message: string; data?: unknown } {
  if (err && typeof err === 'object') {
    const e = err as {
      code?: number;
      message?: string;
      shortMessage?: string;
      details?: string;
      metaMessages?: string[];
      data?: unknown;
      cause?: unknown;
    };
    // Prefer viem's `shortMessage` for the EIP-1474 message field — it's the
    // user-facing reason (e.g. "User rejected the request") whereas `message`
    // is often a noisy multi-line dump that breaks dApp error UIs.
    const message = e.shortMessage ?? (typeof e.message === 'string' ? e.message : 'Unknown error');
    // Preserve viem's rich context under `data` so dApps that introspect it
    // (e.g. RainbowKit's transaction modal) keep working. EIP-1474 allows any
    // value for `data`. We merge with the original `data` if the SDK set one.
    const richData: Record<string, unknown> = {};
    if (typeof e.shortMessage === 'string') richData.shortMessage = e.shortMessage;
    if (typeof e.details === 'string') richData.details = e.details;
    if (Array.isArray(e.metaMessages)) richData.metaMessages = e.metaMessages;
    if (e.cause && typeof e.cause === 'object') {
      const c = e.cause as { shortMessage?: string; details?: string };
      richData.cause = { shortMessage: c.shortMessage, details: c.details };
    }
    if (e.data !== undefined && e.data !== null) richData.original = e.data;
    return {
      code: typeof e.code === 'number' ? e.code : -32603,
      message,
      data: Object.keys(richData).length > 0 ? richData : undefined,
    };
  }
  return { code: -32603, message: String(err) };
}

function isArrayBuffer(v: unknown): boolean {
  return v !== null && typeof v === 'object' && Object.prototype.toString.call(v) === '[object ArrayBuffer]';
}

function encode(value: unknown): unknown {
  if (value === null || value === undefined) return value;
  if (typeof value !== 'object') return value;
  if (isArrayBuffer(value)) {
    return { __t: 'ab', d: Array.from(new Uint8Array(value as ArrayBuffer)) };
  }
  if (ArrayBuffer.isView(value)) {
    const view = value as ArrayBufferView;
    const u8 = new Uint8Array(view.buffer, view.byteOffset, view.byteLength);
    return { __t: 'u8', d: Array.from(u8) };
  }
  if (Array.isArray(value)) return value.map(encode);
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) out[k] = encode(v);
  return out;
}

function decode(value: unknown): unknown {
  if (value === null || value === undefined) return value;
  if (typeof value !== 'object') return value;
  const obj = value as { __t?: string; d?: unknown };
  if (obj.__t === 'u8' && Array.isArray(obj.d)) return new Uint8Array(obj.d as number[]);
  if (obj.__t === 'ab' && Array.isArray(obj.d)) return new Uint8Array(obj.d as number[]).buffer;
  if (Array.isArray(value)) return value.map(decode);
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) out[k] = decode(v);
  return out;
}

function safePost(message: AnyMessage): void {
  try {
    port.postMessage(message);
  } catch (err) {
    console.error('[JAW offscreen] postMessage failed', err);
  }
}
