/**
 * Runs in the MAIN world of the keys.jaw.id signing-popup tab BEFORE the app
 * boots. Replaces `window.opener` with a hidden same-origin iframe's
 * `contentWindow` (a real `Window`/`EventTarget`) and overrides its
 * `postMessage` to forward through the keys-bridge-isolated content script.
 *
 * Chrome's extension messaging APIs (chrome.runtime.sendMessage, .tabs.send-
 * Message, port.postMessage) JSON-serialize payloads — they do NOT use
 * structured clone, so Uint8Array becomes `{0:1,1:2,...}` and ArrayBuffer
 * becomes `{}`, which kills the SDK's AES-GCM decrypt step. We work around
 * this by encoding TypedArrays/ArrayBuffers as `{__t, d:[…]}` before any hop
 * that crosses the extension messaging boundary, and rehydrating at the
 * ultimate consumer.
 *
 * Activates ONLY when the URL carries `_jawext=1` (set by the offscreen's
 * window.open shim). User-opened keys.jaw.id tabs render normally.
 */

const BRIDGE_MARKER_OUT = '__jaw_bridge_main_to_iso__';
const BRIDGE_MARKER_IN = '__jaw_bridge_iso_to_main__';

(function main(): void {
  let isBridged = false;
  try {
    isBridged = new URL(window.location.href).searchParams.get('_jawext') === '1';
  } catch {
    return;
  }
  if (!isBridged) return;

  const iframe = document.createElement('iframe');
  iframe.style.display = 'none';
  iframe.src = 'about:blank';
  const docRoot = document.documentElement;
  docRoot.appendChild(iframe);
  const openerWindow = iframe.contentWindow;
  if (!openerWindow) {
    console.error('[JAW main] failed to get iframe contentWindow');
    return;
  }

  try {
    Object.defineProperty(openerWindow, 'postMessage', {
      value: (data: unknown, _targetOrigin: string) => {
        window.postMessage(
          {
            __jaw_marker: BRIDGE_MARKER_OUT,
            data: encode(data),
            origin: window.location.origin,
          },
          window.location.origin
        );
      },
      writable: true,
      configurable: true,
    });
  } catch (err) {
    console.error('[JAW main] failed to override iframe postMessage', err);
    return;
  }

  try {
    Object.defineProperty(window, 'opener', {
      value: openerWindow,
      writable: true,
      configurable: true,
    });
  } catch (err) {
    console.warn('[JAW main] could not set window.opener', err);
    return;
  }

  window.addEventListener('message', (event: MessageEvent) => {
    if (event.source !== window) return;
    const payload = event.data as { __jaw_marker?: string; data?: unknown } | null;
    if (!payload || payload.__jaw_marker !== BRIDGE_MARKER_IN) return;
    const messageEvent = new MessageEvent('message', {
      data: decode(payload.data),
      origin: window.location.origin,
      source: openerWindow,
    });
    window.dispatchEvent(messageEvent);
  });
})();

// Cross-realm-safe predicates — `instanceof` may fail across realms; these
// internal-slot checks don't.
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
