/**
 * Cross-package integration test: the REAL SDK Communicator
 * (TransportRouter + IframeTransport, iframe mode) talking to the REAL
 * keys-side PopupCommunicator over the actual wire protocol — the full
 * handshake and request/response cycle that unit tests cover only in halves.
 *
 * jsdom cannot load a remote iframe, so the test bridges the two sides
 * manually: SDK -> keys via the iframe contentWindow, keys -> SDK via a fake
 * parent that dispatches MessageEvents on the page window. Real-browser
 * behavior (WebAuthn, IOv2, Safari) is covered by separate validation.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { JSDOM } from 'jsdom';

import { Communicator } from '@jaw.id/core';
import { PopupCommunicator, type Message } from './popup-communicator';

const DAPP_ORIGIN = 'http://localhost:3000';
const KEYS_URL = 'https://keys.jaw.id';
const KEYS_ORIGIN = new URL(KEYS_URL).origin;

// ---- dApp page environment (jsdom) ---------------------------------------
const dom = new JSDOM('<!DOCTYPE html><html><body></body></html>', {
  url: `${DAPP_ORIGIN}/`,
});
global.window = dom.window as unknown as Window & typeof globalThis;
global.document = dom.window.document;
global.MessageEvent = dom.window.MessageEvent;
global.MutationObserver = dom.window.MutationObserver;
global.HTMLElement = dom.window.HTMLElement;

// jsdom lacks dialog showModal()/close() — provide minimal versions so the
// modal under test toggles its `open` attribute as a real browser would.
const dialogProto = dom.window.HTMLDialogElement.prototype as HTMLDialogElement & {
  showModal: () => void;
  close: () => void;
};
dialogProto.showModal = function (this: HTMLDialogElement) {
  this.setAttribute('open', '');
};
dialogProto.close = function (this: HTMLDialogElement) {
  this.removeAttribute('open');
};

// The router gates the iframe on a secure context and IOv2 (clickjacking
// guard) — emulate a Chromium HTTPS-like environment.
Object.defineProperty(dom.window, 'isSecureContext', { value: true, configurable: true });
class FakeIOEntryV2 {}
Object.defineProperty(FakeIOEntryV2.prototype, 'isVisible', { get: () => true });
(globalThis as Record<string, unknown>).IntersectionObserverEntry = FakeIOEntryV2;
(dom.window as unknown as Record<string, unknown>).IntersectionObserverEntry = FakeIOEntryV2;

type Listener = (event: unknown) => void;

/** The keys app's window, as seen from inside the (simulated) iframe. */
function createKeysWindow() {
  const listeners = new Map<string, Listener[]>();
  const parentStub = {
    postMessage: (data: Message, targetOrigin: string) => {
      // keys -> SDK: deliver onto the dApp page window with the keys origin.
      // postMessage across windows is always async — modeling it synchronously
      // would let a reply land before the sender armed its next listener.
      expect(targetOrigin).toBe(DAPP_ORIGIN); // locked from ancestry, never '*'
      setTimeout(() => {
        window.dispatchEvent(new MessageEvent('message', { data, origin: KEYS_ORIGIN }));
      }, 0);
    },
  };
  const keysWin: Record<string, unknown> = {
    opener: null,
    close: vi.fn(),
    addEventListener: (type: string, listener: Listener) => {
      listeners.set(type, [...(listeners.get(type) ?? []), listener]);
    },
    removeEventListener: (type: string, listener: Listener) => {
      listeners.set(
        type,
        (listeners.get(type) ?? []).filter((l) => l !== listener)
      );
    },
    location: { ancestorOrigins: [DAPP_ORIGIN] },
    document: { referrer: `${DAPP_ORIGIN}/` },
    parent: parentStub,
  };
  return {
    keysWin: keysWin as unknown as Window,
    /** SDK -> keys delivery (what the browser would do across the frame boundary, async). */
    deliver: (data: unknown) => {
      setTimeout(() => {
        (listeners.get('message') ?? []).forEach((listener) =>
          listener({ source: parentStub, origin: DAPP_ORIGIN, data })
        );
      }, 0);
    },
  };
}

/**
 * Boots the keys side exactly like page.tsx does: PopupLoaded -> on config ->
 * PopupReady -> answer business requests via the provided handler.
 * Returns every message the keys side received.
 */
function bootKeysApp(
  keys: PopupCommunicator,
  onRequest: (message: Message, keys: PopupCommunicator) => void
): Message[] {
  const received: Message[] = [];
  keys.onMessage((message) => {
    received.push(message);
    const isConfig =
      message.requestId && message.data && typeof message.data === 'object' && 'version' in (message.data as object);
    if (isConfig) {
      keys.sendPopupReady(message.requestId);
      return;
    }
    if (message.id) {
      onRequest(message, keys);
    }
  });
  keys.sendPopupLoaded();
  return received;
}

function createSdkCommunicator() {
  return new Communicator({
    metadata: { appName: 'Integration Test dApp', appLogoUrl: null, defaultChainId: 1 },
    preference: { keysUrl: KEYS_URL, transportMode: 'iframe' },
  });
}

/** Waits for the SDK to mount the iframe, then wires it to the keys window. */
async function bridgeIframe(deliver: (data: unknown) => void): Promise<HTMLIFrameElement> {
  await vi.waitFor(() => {
    expect(document.querySelector('dialog[data-jaw] iframe')).toBeTruthy();
  });
  const iframe = document.querySelector('dialog[data-jaw] iframe') as HTMLIFrameElement;
  Object.defineProperty(iframe, 'contentWindow', {
    value: {
      postMessage: (data: unknown, targetOrigin: string) => {
        expect(targetOrigin).toBe(KEYS_ORIGIN); // SDK never posts to '*'
        deliver(data);
      },
    },
    configurable: true,
  });
  return iframe;
}

describe('SDK <-> keys integration over the iframe transport', () => {
  let sdk: Communicator;

  beforeEach(() => {
    sdk = createSdkCommunicator();
  });

  afterEach(() => {
    sdk.disconnect();
    document.body.innerHTML = '';
    document.head.innerHTML = '';
  });

  it('completes the full handshake and request/response cycle', async () => {
    const { keysWin, deliver } = createKeysWindow();
    const keysApp = new PopupCommunicator(keysWin);

    expect(keysApp.getContext()).toBe('embedded');
    expect(keysApp.getOrigin()).toBe(DAPP_ORIGIN);

    const responsePromise = sdk.postRequestAndWaitForResponse({
      id: 'req-1-1-1-1',
      data: { method: 'wallet_getCapabilities' },
    });

    await bridgeIframe(deliver);
    const received = bootKeysApp(keysApp, (message, app) => {
      app.sendResponse(message.id as string, { ok: true, echoed: message.data });
    });

    const response = await responsePromise;
    expect(response).toMatchObject({
      requestId: 'req-1-1-1-1',
      data: { ok: true, echoed: { method: 'wallet_getCapabilities' } },
    });

    // The keys side received the SDK config (handshake) and the request
    const config = received.find((m) => m.data && typeof m.data === 'object' && 'metadata' in (m.data as object));
    expect(config).toBeTruthy();
    expect((config?.data as { metadata: { appName: string } }).metadata.appName).toBe('Integration Test dApp');
    expect(received.some((m) => m.id === 'req-1-1-1-1')).toBe(true);

    // Dialog became visible for the business request (reveal path)
    expect(document.querySelector('dialog[data-jaw]')?.hasAttribute('open')).toBe(true);
  });

  it('hides the dialog when keys requests a transport-aware close', async () => {
    const { keysWin, deliver } = createKeysWindow();
    const keysApp = new PopupCommunicator(keysWin);

    const responsePromise = sdk.postRequestAndWaitForResponse({
      id: 'req-2-2-2-2',
      data: { method: 'eth_chainId' },
    });

    await bridgeIframe(deliver);
    bootKeysApp(keysApp, (message, app) => {
      app.sendResponse(message.id as string, { chainId: '0x1' });
      app.requestClose('completed'); // page.tsx flow: respond then close
    });

    await responsePromise;
    await vi.waitFor(() => {
      expect(document.querySelector('dialog[data-jaw]')?.hasAttribute('open')).toBe(false);
    });

    // window.close() was never attempted inside the iframe
    expect((keysWin as unknown as { close: ReturnType<typeof vi.fn> }).close).not.toHaveBeenCalled();
  });

  it('switches to popup and replays the in-flight request when keys asks', async () => {
    const { keysWin, deliver } = createKeysWindow();
    const keysApp = new PopupCommunicator(keysWin);

    // Popup the SDK opens for the escape: scripted keys counterpart that
    // completes the popup handshake and answers the replayed request.
    const popupPosts: Message[] = [];
    const popupWindow = {
      closed: false,
      focus: vi.fn(),
      close: vi.fn(),
      postMessage: vi.fn((data: Message) => {
        popupPosts.push(data);
        const isConfig =
          data.requestId && data.data && typeof data.data === 'object' && 'version' in (data.data as object);
        if (isConfig) return;
        if (data.id) {
          window.dispatchEvent(
            new MessageEvent('message', {
              data: { requestId: data.id, data: { from: 'popup' } },
              origin: KEYS_ORIGIN,
            })
          );
        }
      }),
    };
    const originalOpen = window.open;
    window.open = vi.fn(() => {
      setTimeout(() => {
        window.dispatchEvent(
          new MessageEvent('message', {
            data: { event: 'PopupLoaded', id: 'popup-loaded-1' },
            origin: KEYS_ORIGIN,
          })
        );
        setTimeout(() => {
          window.dispatchEvent(
            new MessageEvent('message', {
              data: { event: 'PopupReady', requestId: 'popup-loaded-1' },
              origin: KEYS_ORIGIN,
            })
          );
        }, 0);
      }, 0);
      return popupWindow as unknown as Window;
    });

    try {
      const responsePromise = sdk.postRequestAndWaitForResponse({
        id: 'req-3-3-3-3',
        data: { method: 'wallet_sendCalls' },
      });

      await bridgeIframe(deliver);
      bootKeysApp(keysApp, (_message, app) => {
        // Instead of answering, the embedded dialog escapes to a popup
        // (user clicked "Continue in new window")
        app.requestSwitchToPopup('user');
      });

      const response = await responsePromise;
      expect(response).toMatchObject({ requestId: 'req-3-3-3-3', data: { from: 'popup' } });

      // The request was replayed on the popup transport
      expect(window.open).toHaveBeenCalledTimes(1);
      expect(popupPosts.some((m) => m.id === 'req-3-3-3-3')).toBe(true);
    } finally {
      window.open = originalOpen;
    }
  });
});
