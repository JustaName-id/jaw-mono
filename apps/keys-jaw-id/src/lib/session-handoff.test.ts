// @vitest-environment jsdom
// (SessionManager persists via localStorage; sender/receiver tests inject
// their own seams and don't touch the DOM.)
import { describe, it, expect, vi, beforeEach } from 'vitest';

import {
  SESSION_HANDOFF_MESSAGE_TYPE,
  sendSessionHandoff,
  createSessionHandoffHandler,
  registerSessionHandoffListener,
  type SessionHandoffReceiverDeps,
} from './session-handoff';
import { SessionManager, type AppSession } from './session-manager';

// Node 22 / bun expose an experimental global `localStorage` (see the
// `--localstorage-file` warning) whose API is broken without a backing file,
// and it shadows jsdom's. Pin a deterministic in-memory implementation so the
// SessionManager persistence tests behave the same on every runtime.
const memStore = new Map<string, string>();
vi.stubGlobal('localStorage', {
  getItem: (k: string) => (memStore.has(k) ? memStore.get(k)! : null),
  setItem: (k: string, v: string) => void memStore.set(k, String(v)),
  removeItem: (k: string) => void memStore.delete(k),
  clear: () => memStore.clear(),
  key: (i: number) => [...memStore.keys()][i] ?? null,
  get length() {
    return memStore.size;
  },
});

const SELF_ORIGIN = 'https://keys.jaw.id';
const DAPP_ORIGIN = 'https://dapp.example.com';

const validSession = (): AppSession => ({
  popupPrivateKey: 'aa'.repeat(32),
  popupPublicKey: 'bb'.repeat(32),
  peerPublicKey: 'cc'.repeat(32),
  authState: {
    address: '0x1111111111111111111111111111111111111111',
    credentialId: 'cred-1',
    username: 'alice',
    publicKey: '0xdeadbeef',
  },
  createdAt: 1000,
  lastUsedAt: 1000,
});

// ---------------------------------------------------------------------------
// Sender
// ---------------------------------------------------------------------------

type FakeFrame = {
  length: number;
  frames: FakeFrame[];
  postMessage: ReturnType<typeof vi.fn>;
};

/** Build a fake window whose `frames` supports indexed access like the real one. */
const fakeFrame = (children: FakeFrame[] = []): FakeFrame => {
  const frame = {
    length: children.length,
    frames: children,
    postMessage: vi.fn(),
  };
  return frame;
};

describe('sendSessionHandoff', () => {
  it('posts the session to every frame of the opener tree, pinned to its own origin', () => {
    const nested = fakeFrame();
    const child = fakeFrame([nested]);
    const opener = fakeFrame([child]);

    sendSessionHandoff({
      dappOrigin: DAPP_ORIGIN,
      session: validSession(),
      opener: opener as unknown as Window,
      targetOrigin: SELF_ORIGIN,
    });

    const expected = {
      type: SESSION_HANDOFF_MESSAGE_TYPE,
      dappOrigin: DAPP_ORIGIN,
      session: validSession(),
    };
    expect(child.postMessage).toHaveBeenCalledWith(expected, SELF_ORIGIN);
    expect(nested.postMessage).toHaveBeenCalledWith(expected, SELF_ORIGIN);
    // The opener top window (the dApp) is never a target — only its frames.
    expect(opener.postMessage).not.toHaveBeenCalled();
  });

  it('is a no-op without an opener (standalone/embedded context, COOP-severed)', () => {
    expect(() =>
      sendSessionHandoff({
        dappOrigin: DAPP_ORIGIN,
        session: validSession(),
        opener: null,
        targetOrigin: SELF_ORIGIN,
      })
    ).not.toThrow();
  });

  it('skips subtrees whose cross-origin access throws, without aborting the walk', () => {
    const reachable = fakeFrame();
    const hostile = fakeFrame();
    Object.defineProperty(hostile, 'length', {
      get() {
        throw new Error('SecurityError');
      },
    });
    const opener = fakeFrame([hostile, reachable]);

    sendSessionHandoff({
      dappOrigin: DAPP_ORIGIN,
      session: validSession(),
      opener: opener as unknown as Window,
      targetOrigin: SELF_ORIGIN,
    });

    // The hostile frame itself is still posted to (delivery is origin-gated by
    // the browser); only its CHILDREN become unreachable.
    expect(reachable.postMessage).toHaveBeenCalledTimes(1);
  });

  it('bounds the traversal by frame count', () => {
    const children = Array.from({ length: 64 }, () => fakeFrame());
    const opener = fakeFrame(children);

    sendSessionHandoff({
      dappOrigin: DAPP_ORIGIN,
      session: validSession(),
      opener: opener as unknown as Window,
      targetOrigin: SELF_ORIGIN,
    });

    const posted = children.filter((c) => c.postMessage.mock.calls.length > 0);
    expect(posted.length).toBe(32);
  });

  it('bounds the traversal by depth', () => {
    const level4 = fakeFrame();
    const level3 = fakeFrame([level4]);
    const level2 = fakeFrame([level3]);
    const level1 = fakeFrame([level2]);
    const opener = fakeFrame([level1]);

    sendSessionHandoff({
      dappOrigin: DAPP_ORIGIN,
      session: validSession(),
      opener: opener as unknown as Window,
      targetOrigin: SELF_ORIGIN,
    });

    expect(level1.postMessage).toHaveBeenCalledTimes(1);
    expect(level2.postMessage).toHaveBeenCalledTimes(1);
    expect(level3.postMessage).toHaveBeenCalledTimes(1);
    expect(level4.postMessage).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Receiver
// ---------------------------------------------------------------------------

const makeDeps = (overrides: Partial<SessionHandoffReceiverDeps> = {}) => {
  const imported = validSession();
  const deps = {
    isEmbedded: () => true,
    getEmbedderOrigin: () => DAPP_ORIGIN,
    importSession: vi.fn().mockResolvedValue(imported),
    seedAccountList: vi.fn(),
    onImported: vi.fn(),
    selfOrigin: SELF_ORIGIN,
    ...overrides,
  } satisfies SessionHandoffReceiverDeps;
  return deps;
};

const handoffEvent = (overrides: { origin?: string; data?: unknown } = {}): MessageEvent =>
  ({
    origin: overrides.origin ?? SELF_ORIGIN,
    data:
      'data' in overrides
        ? overrides.data
        : { type: SESSION_HANDOFF_MESSAGE_TYPE, dappOrigin: DAPP_ORIGIN, session: validSession() },
  }) as MessageEvent;

describe('createSessionHandoffHandler', () => {
  it('imports the session, seeds the account list, and notifies on a valid handoff', async () => {
    const deps = makeDeps();
    await createSessionHandoffHandler(deps)(handoffEvent());

    expect(deps.importSession).toHaveBeenCalledWith(DAPP_ORIGIN, validSession());
    expect(deps.seedAccountList).toHaveBeenCalledWith(validSession().authState);
    expect(deps.onImported).toHaveBeenCalledWith(DAPP_ORIGIN, validSession().authState);
  });

  it('rejects when not running embedded', async () => {
    const deps = makeDeps({ isEmbedded: () => false });
    await createSessionHandoffHandler(deps)(handoffEvent());
    expect(deps.importSession).not.toHaveBeenCalled();
  });

  it('rejects senders that are not this same origin', async () => {
    const deps = makeDeps();
    await createSessionHandoffHandler(deps)(handoffEvent({ origin: DAPP_ORIGIN }));
    expect(deps.importSession).not.toHaveBeenCalled();
  });

  it('ignores unrelated message types and malformed payloads', async () => {
    const deps = makeDeps();
    const handler = createSessionHandoffHandler(deps);

    await handler(handoffEvent({ data: null }));
    await handler(handoffEvent({ data: 'string' }));
    await handler(handoffEvent({ data: { type: 'other' } }));
    await handler(handoffEvent({ data: { type: SESSION_HANDOFF_MESSAGE_TYPE } }));
    await handler(
      handoffEvent({ data: { type: SESSION_HANDOFF_MESSAGE_TYPE, dappOrigin: 42, session: validSession() } })
    );

    expect(deps.importSession).not.toHaveBeenCalled();
  });

  it('rejects a session without authState (nothing to skip)', async () => {
    const deps = makeDeps();
    const session = { ...validSession(), authState: null };
    await createSessionHandoffHandler(deps)(
      handoffEvent({ data: { type: SESSION_HANDOFF_MESSAGE_TYPE, dappOrigin: DAPP_ORIGIN, session } })
    );
    expect(deps.importSession).not.toHaveBeenCalled();
  });

  it("rejects a handoff whose dApp origin is not this iframe's embedder", async () => {
    const deps = makeDeps({ getEmbedderOrigin: () => 'https://other.example.com' });
    await createSessionHandoffHandler(deps)(handoffEvent());
    expect(deps.importSession).not.toHaveBeenCalled();
  });

  it('rejects when the embedder origin could not be locked', async () => {
    const deps = makeDeps({ getEmbedderOrigin: () => null });
    await createSessionHandoffHandler(deps)(handoffEvent());
    expect(deps.importSession).not.toHaveBeenCalled();
  });

  it('does not seed or notify when the import is rejected', async () => {
    const deps = makeDeps({ importSession: vi.fn().mockResolvedValue(null) });
    await createSessionHandoffHandler(deps)(handoffEvent());
    expect(deps.seedAccountList).not.toHaveBeenCalled();
    expect(deps.onImported).not.toHaveBeenCalled();
  });

  it('still notifies when list seeding throws (seeding is cosmetic)', async () => {
    const deps = makeDeps({
      seedAccountList: vi.fn(() => {
        throw new Error('storage full');
      }),
    });
    await createSessionHandoffHandler(deps)(handoffEvent());
    expect(deps.onImported).toHaveBeenCalled();
  });
});

describe('registerSessionHandoffListener', () => {
  it('registers on the window and the returned cleanup unregisters', () => {
    const listeners = new Map<string, EventListener>();
    const win = {
      addEventListener: vi.fn((type: string, fn: EventListener) => listeners.set(type, fn)),
      removeEventListener: vi.fn((type: string) => listeners.delete(type)),
    } as unknown as Window;

    const cleanup = registerSessionHandoffListener(makeDeps(), win);
    expect(listeners.has('message')).toBe(true);
    cleanup();
    expect(listeners.has('message')).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// SessionManager.importSession
// ---------------------------------------------------------------------------

describe('SessionManager.importSession', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('persists the imported session so it is readable via getSession', async () => {
    const manager = new SessionManager();
    const imported = await manager.importSession(DAPP_ORIGIN, validSession());

    expect(imported?.authState?.credentialId).toBe('cred-1');
    const roundTripped = await manager.getSession(DAPP_ORIGIN);
    expect(roundTripped?.authState?.address).toBe(validSession().authState?.address);
    // A fresh manager (post-reload) reads it from storage too.
    const reloaded = new SessionManager();
    expect((await reloaded.getSession(DAPP_ORIGIN))?.authState?.credentialId).toBe('cred-1');
  });

  it('overwrites an existing session for the origin (the popup state is newer)', async () => {
    const manager = new SessionManager();
    await manager.createSession({ origin: DAPP_ORIGIN, peerPublicKey: 'dd'.repeat(32) });

    await manager.importSession(DAPP_ORIGIN, validSession());

    const session = await manager.getSession(DAPP_ORIGIN);
    expect(session?.peerPublicKey).toBe('cc'.repeat(32));
    expect(session?.authState?.credentialId).toBe('cred-1');
  });

  it('rejects an invalid origin and an invalid session shape', async () => {
    const manager = new SessionManager();
    expect(await manager.importSession('not-an-origin', validSession())).toBeNull();

    const malformed = { ...validSession(), popupPrivateKey: 42 } as unknown as AppSession;
    expect(await manager.importSession(DAPP_ORIGIN, malformed)).toBeNull();
    expect(await manager.getSession(DAPP_ORIGIN)).toBeNull();
  });
});
