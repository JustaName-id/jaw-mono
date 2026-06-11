import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

import { PopupCommunicator } from './popup-communicator';

const SDK_ORIGIN = 'https://dapp.example.com';

type Listener = (event: unknown) => void;

type FakeWindowOptions = {
  opener?: object | null;
  embedded?: boolean;
  ancestorOrigins?: string[];
  referrer?: string;
};

type FakeWindow = Window & {
  emit: (type: string, event?: unknown) => void;
  close: ReturnType<typeof vi.fn>;
  counterpartPost: ReturnType<typeof vi.fn>;
};

/**
 * Builds a minimal window double. The communicator only touches opener,
 * parent, location.ancestorOrigins, document.referrer, close and the
 * event listener API — full control without jsdom.
 */
function createFakeWindow({
  opener = null,
  embedded = false,
  ancestorOrigins = [],
  referrer = '',
}: FakeWindowOptions = {}): FakeWindow {
  const listeners = new Map<string, Listener[]>();
  const counterpartPost = vi.fn();

  const win: Record<string, unknown> = {
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
    location: {
      ancestorOrigins: ancestorOrigins.length > 0 ? ancestorOrigins : undefined,
    },
    document: { referrer },
    emit: (type: string, event?: unknown) => {
      (listeners.get(type) ?? []).forEach((listener) => listener(event));
    },
    counterpartPost,
  };

  if (opener) {
    win.opener = opener;
    win.parent = win;
  } else if (embedded) {
    win.opener = null;
    win.parent = { postMessage: counterpartPost };
  } else {
    win.opener = null;
    win.parent = win;
  }

  return win as unknown as FakeWindow;
}

function createPopupWindow(options: Omit<FakeWindowOptions, 'opener' | 'embedded'> = {}): {
  win: FakeWindow;
  opener: { postMessage: ReturnType<typeof vi.fn> };
} {
  const post = vi.fn();
  const opener = { postMessage: post };
  const win = createFakeWindow({ opener, referrer: `${SDK_ORIGIN}/`, ...options });
  return { win, opener };
}

describe('context detection', () => {
  it('detects popup context when window.opener exists', () => {
    const { win } = createPopupWindow();
    expect(new PopupCommunicator(win).getContext()).toBe('popup');
  });

  it('detects embedded context when window.parent differs (window.opener null)', () => {
    const win = createFakeWindow({ embedded: true, ancestorOrigins: [SDK_ORIGIN] });
    expect(new PopupCommunicator(win).getContext()).toBe('embedded');
  });

  it('detects standalone on direct navigation and stays inert', () => {
    const win = createFakeWindow({});
    const communicator = new PopupCommunicator(win);

    expect(communicator.getContext()).toBe('standalone');
    expect(communicator.hasOpener()).toBe(false);
    expect(() => communicator.sendPopupLoaded()).not.toThrow();
    expect(() => communicator.requestClose()).not.toThrow();
    expect(win.close).not.toHaveBeenCalled();
  });

  it('handles a missing window (SSR) as standalone', () => {
    expect(new PopupCommunicator(null).getContext()).toBe('standalone');
  });
});

describe('origin locking (AC-5)', () => {
  it('embedded: locks from location.ancestorOrigins, not from messages', () => {
    const win = createFakeWindow({ embedded: true, ancestorOrigins: [SDK_ORIGIN] });
    expect(new PopupCommunicator(win).getOrigin()).toBe(SDK_ORIGIN);
  });

  it('embedded: falls back to the referrer origin (Firefox has no ancestorOrigins)', () => {
    const win = createFakeWindow({ embedded: true, referrer: `${SDK_ORIGIN}/some/page` });
    expect(new PopupCommunicator(win).getOrigin()).toBe(SDK_ORIGIN);
  });

  it('embedded: communicator is disabled without ancestry or referrer', () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const win = createFakeWindow({ embedded: true });
    const communicator = new PopupCommunicator(win);

    expect(communicator.getOrigin()).toBeNull();

    communicator.sendPopupLoaded();
    expect(win.counterpartPost).not.toHaveBeenCalled();
    consoleError.mockRestore();
  });

  it('popup: locks from the referrer at startup', () => {
    const { win } = createPopupWindow();
    expect(new PopupCommunicator(win).getOrigin()).toBe(SDK_ORIGIN);
  });
});

describe('outbound messages (no wildcard targets)', () => {
  it('posts to the locked origin, never to "*"', () => {
    const { win, opener } = createPopupWindow();
    const communicator = new PopupCommunicator(win);

    communicator.sendPopupLoaded();

    expect(opener.postMessage).toHaveBeenCalledTimes(1);
    const [message, targetOrigin] = opener.postMessage.mock.calls[0];
    expect(message.event).toBe('PopupLoaded');
    expect(targetOrigin).toBe(SDK_ORIGIN);
  });

  it('embedded: posts to window.parent with the ancestry origin', () => {
    const win = createFakeWindow({ embedded: true, ancestorOrigins: [SDK_ORIGIN] });
    const communicator = new PopupCommunicator(win);

    communicator.sendPopupReady();

    expect(win.counterpartPost).toHaveBeenCalledWith(
      expect.objectContaining({ event: 'PopupReady' }),
      SDK_ORIGIN
    );
  });

  it('popup without referrer: queues outbound until the first source-validated message locks the origin', () => {
    const { win, opener } = createPopupWindow({ referrer: '' });
    const communicator = new PopupCommunicator(win);
    communicator.onMessage(() => undefined);

    communicator.sendPopupLoaded();
    expect(opener.postMessage).not.toHaveBeenCalled(); // queued — never '*'

    win.emit('message', { source: opener, origin: SDK_ORIGIN, data: { requestId: 'r-1-1-1-1' } });

    expect(opener.postMessage).toHaveBeenCalledTimes(1);
    expect(opener.postMessage.mock.calls[0][1]).toBe(SDK_ORIGIN);
  });
});

describe('inbound validation (AC-E3, AC-E5)', () => {
  it('ignores messages whose source is not the counterpart — popup context', () => {
    const { win } = createPopupWindow();
    const communicator = new PopupCommunicator(win);
    const received = vi.fn();
    communicator.onMessage(received);

    win.emit('message', { source: { other: true }, origin: SDK_ORIGIN, data: { x: 1 } });

    expect(received).not.toHaveBeenCalled();
  });

  it('ignores messages whose source is not the parent — embedded context', () => {
    const win = createFakeWindow({ embedded: true, ancestorOrigins: [SDK_ORIGIN] });
    const communicator = new PopupCommunicator(win);
    const received = vi.fn();
    communicator.onMessage(received);

    win.emit('message', { source: { hostileFrame: true }, origin: SDK_ORIGIN, data: { x: 1 } });

    expect(received).not.toHaveBeenCalled();
  });

  it('ignores messages from an unexpected origin after the lock', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const { win, opener } = createPopupWindow();
    const communicator = new PopupCommunicator(win);
    const received = vi.fn();
    communicator.onMessage(received);

    win.emit('message', { source: opener, origin: 'https://evil.example.com', data: { x: 1 } });

    expect(received).not.toHaveBeenCalled();
    warn.mockRestore();
  });

  it('AC-E5: a hostile first message cannot poison the embedded origin lock', () => {
    const win = createFakeWindow({ embedded: true, ancestorOrigins: [SDK_ORIGIN] });
    const communicator = new PopupCommunicator(win);
    const received = vi.fn();
    communicator.onMessage(received);

    // Hostile page script posts first, spoofing source identity is impossible,
    // but even a parent-sourced message cannot move the lock:
    win.emit('message', {
      source: win.parent,
      origin: 'https://evil.example.com',
      data: { event: 'poison' },
    });

    expect(received).not.toHaveBeenCalled();
    expect(communicator.getOrigin()).toBe(SDK_ORIGIN);

    // The legitimate handshake still works afterwards
    win.emit('message', { source: win.parent, origin: SDK_ORIGIN, data: { event: 'config' } });
    expect(received).toHaveBeenCalledWith({ event: 'config' });
  });

  it('embedded without ancestry stays deaf — no first-message lock fallback (unlike popup)', () => {
    const win = createFakeWindow({ embedded: true });
    const communicator = new PopupCommunicator(win);
    const received = vi.fn();
    communicator.onMessage(received);

    win.emit('message', { source: win.parent, origin: 'https://evil.example.com', data: { x: 1 } });

    expect(received).not.toHaveBeenCalled();
    expect(communicator.getOrigin()).toBeNull();
  });
});

describe('requestClose (AC-5b)', () => {
  it('popup context: closes the window', () => {
    const { win } = createPopupWindow();
    new PopupCommunicator(win).requestClose();
    expect(win.close).toHaveBeenCalledTimes(1);
  });

  it('embedded context: posts DialogClose with the reason instead of closing', () => {
    const win = createFakeWindow({ embedded: true, ancestorOrigins: [SDK_ORIGIN] });
    const communicator = new PopupCommunicator(win);

    communicator.requestClose('cancelled');

    expect(win.close).not.toHaveBeenCalled();
    expect(win.counterpartPost).toHaveBeenCalledWith(
      expect.objectContaining({ event: 'DialogClose', data: { reason: 'cancelled' } }),
      SDK_ORIGIN
    );
  });

  it('defaults the reason to "completed"', () => {
    const win = createFakeWindow({ embedded: true, ancestorOrigins: [SDK_ORIGIN] });
    new PopupCommunicator(win).requestClose();

    expect(win.counterpartPost).toHaveBeenCalledWith(
      expect.objectContaining({ data: { reason: 'completed' } }),
      SDK_ORIGIN
    );
  });
});

describe('requestSwitchToPopup (AC-11)', () => {
  it('embedded context: posts SwitchTransport with the reason', () => {
    const win = createFakeWindow({ embedded: true, ancestorOrigins: [SDK_ORIGIN] });
    new PopupCommunicator(win).requestSwitchToPopup('visibility');

    expect(win.counterpartPost).toHaveBeenCalledWith(
      expect.objectContaining({
        event: 'SwitchTransport',
        data: { to: 'popup', reason: 'visibility' },
      }),
      SDK_ORIGIN
    );
  });

  it('popup context: is a no-op', () => {
    const { win, opener } = createPopupWindow();
    new PopupCommunicator(win).requestSwitchToPopup('user');
    expect(opener.postMessage).not.toHaveBeenCalled();
  });
});

describe('lifecycle', () => {
  it('popup context: sends PopupUnload on beforeunload', () => {
    const { win, opener } = createPopupWindow();
    new PopupCommunicator(win);

    win.emit('beforeunload');

    expect(opener.postMessage).toHaveBeenCalledWith(
      expect.objectContaining({ event: 'PopupUnload' }),
      SDK_ORIGIN
    );
  });

  it('embedded context: sends PopupUnload on pagehide (beforeunload unreliable in iframes)', () => {
    const win = createFakeWindow({ embedded: true, ancestorOrigins: [SDK_ORIGIN] });
    new PopupCommunicator(win);

    win.emit('pagehide');

    expect(win.counterpartPost).toHaveBeenCalledWith(
      expect.objectContaining({ event: 'PopupUnload' }),
      SDK_ORIGIN
    );

    win.counterpartPost.mockClear();
    win.emit('beforeunload');
    expect(win.counterpartPost).not.toHaveBeenCalled();
  });

  it('onMessage returns a working cleanup function', () => {
    const { win, opener } = createPopupWindow();
    const communicator = new PopupCommunicator(win);
    const received = vi.fn();

    const cleanup = communicator.onMessage(received);
    cleanup();

    win.emit('message', { source: opener, origin: SDK_ORIGIN, data: { x: 1 } });
    expect(received).not.toHaveBeenCalled();
  });
});

describe('back-compat surface', () => {
  let consoleError: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
  });

  afterEach(() => {
    consoleError.mockRestore();
  });

  it('hasOpener() is true for both popup and embedded contexts', () => {
    const { win } = createPopupWindow();
    expect(new PopupCommunicator(win).hasOpener()).toBe(true);

    const embedded = createFakeWindow({ embedded: true, ancestorOrigins: [SDK_ORIGIN] });
    expect(new PopupCommunicator(embedded).hasOpener()).toBe(true);
  });

  it('sendResponse posts the requestId/data pair', () => {
    const { win, opener } = createPopupWindow();
    new PopupCommunicator(win).sendResponse('r-1-1-1-1', { ok: true });

    expect(opener.postMessage).toHaveBeenCalledWith(
      { requestId: 'r-1-1-1-1', data: { ok: true } },
      SDK_ORIGIN
    );
  });
});
