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

import { Communicator, standardErrorCodes, type RPCRequestMessage } from '@jaw.id/core';
import { createFlowLock } from './flow-lock';
import { buildHandshakeFailure, routeHandshake, routeOwnsScreen } from './handshake-route';
import { PopupCommunicator, type Message } from './popup-communicator';

// The iframe transport requires a real HTTPS origin (http://localhost falls
// back to popup), so the dApp page must be served over HTTPS to exercise it.
const DAPP_ORIGIN = 'https://localhost:3000';
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

  it('pushes a live theme update to the keys app as a SetTheme message', async () => {
    const { keysWin, deliver } = createKeysWindow();
    const keysApp = new PopupCommunicator(keysWin);

    const responsePromise = sdk.postRequestAndWaitForResponse({
      id: 'req-theme-1-1-1',
      data: { method: 'wallet_getCapabilities' },
    });

    await bridgeIframe(deliver);
    const received = bootKeysApp(keysApp, (message, app) => {
      app.sendResponse(message.id as string, { ok: true });
    });
    await responsePromise;

    // A live theme update (e.g. an OS light/dark flip on the dApp) must reach
    // the keys side as a SetTheme message — without a reconnect or reload.
    sdk.updateTheme({ mode: 'dark', accentColor: '#6366f1' });

    await vi.waitFor(() => {
      expect(received.some((m) => m.event === 'SetTheme')).toBe(true);
    });
    const setTheme = received.find((m) => m.event === 'SetTheme');
    expect(setTheme?.data).toEqual({ theme: { mode: 'dark', accentColor: '#6366f1' } });
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
        // (e.g. a programmatic switch to the popup transport)
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

/**
 * page.tsx's handshake handler, reduced to its routing: the same routeHandshake
 * + flow lock it composes, over the real transport. The React work each route
 * does (session CRUD, screens) is out of scope here.
 */
function bootKeysRouter(keys: PopupCommunicator, originsWithSession: Set<string>) {
  const lock = createFlowLock();
  const routes: string[] = [];
  const refusals: number[] = [];

  bootKeysApp(keys, (message) => {
    const request = message as unknown as RPCRequestMessage;
    const handshake = (request.content as { handshake?: { method: string } } | undefined)?.handshake;

    if (lock.isOpen()) {
      refusals.push(standardErrorCodes.rpc.resourceUnavailable);
      keys.sendMessage(
        buildHandshakeFailure(
          request,
          standardErrorCodes.rpc.resourceUnavailable,
          'A request is already in progress'
        ) as unknown as Message
      );
      return;
    }
    lock.claim();

    const route = routeHandshake({
      hasHandshake: Boolean(handshake),
      method: handshake?.method,
      hasSession: originsWithSession.has(DAPP_ORIGIN),
    });
    routes.push(route);

    try {
      if (route === 'connect-first') {
        keys.sendMessage(
          buildHandshakeFailure(
            request,
            standardErrorCodes.provider.unauthorized,
            'No connection for this origin; call wallet_connect first'
          ) as unknown as Message
        );
        keys.requestClose();
        return;
      }
      if (route === 'cold-start' || route === 'connect') {
        keys.sendResponse(request.id as string, { accounts: [] });
      }
    } finally {
      if (!routeOwnsScreen(route)) lock.release();
    }
  });

  return { lock, routes, refusals };
}

function handshakeRequest(id: string, method: string) {
  return { id, sender: 'peer-key-hex', content: { handshake: { method, params: [] } } };
}

describe('handshake routing over the iframe transport', () => {
  let sdk: Communicator;

  beforeEach(() => {
    sdk = createSdkCommunicator();
  });

  afterEach(() => {
    sdk.disconnect();
    document.body.innerHTML = '';
    document.head.innerHTML = '';
  });

  it('answers 4100 and closes the dialog when no session exists', async () => {
    const { keysWin, deliver } = createKeysWindow();
    const keysApp = new PopupCommunicator(keysWin);

    const responsePromise = sdk.postRequestAndWaitForResponse(handshakeRequest('hs-1', 'handshake'));
    await bridgeIframe(deliver);
    const router = bootKeysRouter(keysApp, new Set());

    const response = (await responsePromise) as unknown as { content: { failure?: { code: number } } };
    expect(response.content.failure?.code).toBe(standardErrorCodes.provider.unauthorized);
    expect(router.routes).toEqual(['connect-first']);

    await vi.waitFor(() => {
      expect(document.querySelector('dialog[data-jaw]')?.hasAttribute('open')).toBe(false);
    });
    expect(router.lock.isOpen()).toBe(false);
  });

  it('leaves the lock held after a cold-start ack, so the follow-up owns the screen', async () => {
    const { keysWin, deliver } = createKeysWindow();
    const keysApp = new PopupCommunicator(keysWin);

    const responsePromise = sdk.postRequestAndWaitForResponse(handshakeRequest('hs-2', 'handshake'));
    await bridgeIframe(deliver);
    const router = bootKeysRouter(keysApp, new Set([DAPP_ORIGIN]));

    await responsePromise;
    expect(router.routes).toEqual(['cold-start']);
    expect(router.lock.isOpen()).toBe(true);
  });

  it('refuses a second handshake while a connect is still unanswered', async () => {
    const { keysWin, deliver } = createKeysWindow();
    const keysApp = new PopupCommunicator(keysWin);

    const first = sdk.postRequestAndWaitForResponse(handshakeRequest('hs-3a', 'wallet_connect'));
    await bridgeIframe(deliver);
    const router = bootKeysRouter(keysApp, new Set());
    await first;

    const second = (await sdk.postRequestAndWaitForResponse(
      handshakeRequest('hs-3b', 'eth_requestAccounts')
    )) as unknown as { content: { failure?: { code: number; message: string } } };

    expect(second.content.failure?.code).toBe(standardErrorCodes.rpc.resourceUnavailable);
    expect(second.content.failure?.message).toBe('A request is already in progress');
    expect(router.routes).toEqual(['connect']);
    expect(router.lock.isOpen()).toBe(true);
  });

  it('releases the lock on an unsupported method, so the next handshake is served', async () => {
    const { keysWin, deliver } = createKeysWindow();
    const keysApp = new PopupCommunicator(keysWin);

    void sdk.postRequestAndWaitForResponse(handshakeRequest('hs-4a', 'eth_sendRawTransaction')).catch(() => undefined);
    await bridgeIframe(deliver);
    const router = bootKeysRouter(keysApp, new Set([DAPP_ORIGIN]));

    await vi.waitFor(() => expect(router.routes).toEqual(['unsupported']));
    expect(router.lock.isOpen()).toBe(false);

    await sdk.postRequestAndWaitForResponse(handshakeRequest('hs-4b', 'handshake'));
    expect(router.routes).toEqual(['unsupported', 'cold-start']);
    expect(router.refusals).toEqual([]);
  });

  it('releases the lock on a handshake with no handshake content', async () => {
    const { keysWin, deliver } = createKeysWindow();
    const keysApp = new PopupCommunicator(keysWin);

    void sdk.postRequestAndWaitForResponse({ id: 'hs-5', sender: 'peer', content: {} }).catch(() => undefined);
    await bridgeIframe(deliver);
    const router = bootKeysRouter(keysApp, new Set([DAPP_ORIGIN]));

    await vi.waitFor(() => expect(router.routes).toEqual(['invalid']));
    expect(router.lock.isOpen()).toBe(false);
  });
});

describe('dialog dismissal over the iframe transport', () => {
  let sdk: Communicator;

  beforeEach(() => {
    sdk = createSdkCommunicator();
  });

  afterEach(() => {
    sdk.disconnect();
    document.body.innerHTML = '';
    document.head.innerHTML = '';
  });

  it('rejects the in-flight request and tells keys the dialog hid on Escape', async () => {
    const { keysWin, deliver } = createKeysWindow();
    const keysApp = new PopupCommunicator(keysWin);

    const responsePromise = sdk.postRequestAndWaitForResponse({
      id: 'dismiss-1',
      data: { method: 'wallet_sendCalls' },
    });
    await bridgeIframe(deliver);
    const received = bootKeysApp(keysApp, () => {
      /* never answers — the user escapes instead */
    });

    await vi.waitFor(() => {
      expect(received.some((m) => m.id === 'dismiss-1')).toBe(true);
    });

    const dialog = document.querySelector('dialog[data-jaw]') as HTMLDialogElement;
    dialog.dispatchEvent(new dom.window.Event('cancel', { cancelable: true }));

    await expect(responsePromise).rejects.toMatchObject({ code: 4001 });
    await vi.waitFor(() => {
      const hidden = received.filter(
        (m) => m.event === 'DialogVisibility' && (m.data as { visible?: boolean })?.visible === false
      );
      expect(hidden.length).toBeGreaterThan(0);
    });
  });

  it("only hides on a 'completed' close, and rejects on a 'cancelled' one", async () => {
    const { keysWin, deliver } = createKeysWindow();
    const keysApp = new PopupCommunicator(keysWin);

    const completed = sdk.postRequestAndWaitForResponse({ id: 'close-1', data: { method: 'eth_chainId' } });
    await bridgeIframe(deliver);
    bootKeysApp(keysApp, (message, app) => {
      app.sendResponse(message.id as string, { chainId: '0x1' });
      app.requestClose('completed');
    });
    await expect(completed).resolves.toMatchObject({ requestId: 'close-1' });

    const cancelled = sdk.postRequestAndWaitForResponse({ id: 'close-2', data: { method: 'eth_chainId' } });
    await vi.waitFor(() => {
      expect(document.querySelector('dialog[data-jaw]')?.hasAttribute('open')).toBe(true);
    });
    keysApp.requestClose('cancelled');
    await expect(cancelled).rejects.toMatchObject({ code: 4001 });
  });
});
