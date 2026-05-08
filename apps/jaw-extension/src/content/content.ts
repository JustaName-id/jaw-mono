import { PORT_NAME_CONTENT } from '../shared/constants.js';
import type { AnyMessage } from '../shared/messages.js';

// Per-tab secret. Page-world scripts can read the script tag's `src` attribute
// (which carries the nonce in its hash fragment), so this is best-effort —
// the real security boundary is the keys.jaw.id passkey prompt.
const NONCE: string = crypto.randomUUID();
const EVENT_NAME: string = `jaw-${crypto.randomUUID()}`;

// Inject the bundled inpage as `<script type="module" src="chrome-extension://.../assets/inpage.js#nonce=...&event=...">`.
// WAR resources injected this way bypass page CSP — same pattern MetaMask et al. use.
// Doing this from the content script (not chrome.scripting.executeScript) means
// we don't need <all_urls> host_permissions: content_scripts.matches is enough.
function injectInpage(): void {
  try {
    const url = chrome.runtime.getURL('assets/inpage.js');
    const hash = `#nonce=${encodeURIComponent(NONCE)}&event=${encodeURIComponent(EVENT_NAME)}`;
    const script = document.createElement('script');
    script.type = 'module';
    script.async = false;
    script.src = url + hash;
    script.dataset.jaw = '1';
    script.onload = () => {
      console.log('[JAW] inpage loaded');
      script.remove();
    };
    script.onerror = (e) => console.error('[JAW] inpage failed to load', e);
    const parent = document.head ?? document.documentElement;
    if (!parent) {
      console.error('[JAW] no parent element to inject into');
      return;
    }
    parent.insertBefore(script, parent.firstChild);
    console.log('[JAW] inpage script tag injected', script.src);
  } catch (err) {
    console.error('[JAW] inpage injection failed', err);
  }
}

console.log('[JAW] content script loaded on', window.location.origin);
injectInpage();

let port: chrome.runtime.Port | null = null;

function connect(): chrome.runtime.Port {
  const p = chrome.runtime.connect({ name: PORT_NAME_CONTENT });
  p.onMessage.addListener((message: AnyMessage) => {
    forwardToInpage(message);
  });
  p.onDisconnect.addListener(() => {
    port = null;
  });
  return p;
}

function getPort(): chrome.runtime.Port {
  if (!port) port = connect();
  return port;
}

function forwardToInpage(message: AnyMessage): void {
  const detail = { nonce: NONCE, payload: message };
  window.dispatchEvent(new CustomEvent(EVENT_NAME, { detail }));
}

window.addEventListener(EVENT_NAME, (event: Event) => {
  const ce = event as CustomEvent<{ nonce: string; payload: AnyMessage }>;
  const detail = ce.detail;
  if (!detail || detail.nonce !== NONCE || !detail.payload) return;
  const payload = detail.payload;
  if (payload.kind !== 'rpc-request') return;
  try {
    getPort().postMessage(payload);
  } catch {
    port = null;
    try {
      getPort().postMessage(payload);
    } catch (retryErr) {
      console.error('[JAW] background unreachable', retryErr);
    }
  }
});

// Establish the port so the background knows which tab is connected (used for
// routing provider events to the right tab).
getPort();
