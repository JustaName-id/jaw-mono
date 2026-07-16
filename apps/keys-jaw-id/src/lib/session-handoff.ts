/**
 * Popup → iframe session handoff.
 *
 * On Safari a first connect (and any passkey creation) runs in the POPUP's
 * first-party world; the embedded iframe's storage partition never sees the
 * session the popup writes. Without a handoff, the next dApp action walks the
 * user through a second passkey ceremony ("Continue as") just to rebuild
 * authState inside the partition — even though they authenticated moments
 * earlier.
 *
 * The popup and the iframe are the SAME origin, and the browser gives us an
 * authenticated channel between them that the dApp cannot observe or forge:
 *
 *  - The popup reaches the iframe through `window.opener`'s frame tree.
 *    Cross-origin access to `frames`/`length`/`postMessage` is spec-allowed.
 *    It posts the session to EVERY frame with `targetOrigin` pinned to its
 *    own origin — the browser silently drops delivery to any frame that is
 *    not keys.jaw.id, so the dApp (and any other embedded content) never
 *    receives it.
 *  - The iframe accepts the message only when `event.origin` is its own
 *    origin. Only same-origin code can produce such an event, and that code
 *    only sends a session after a real passkey ceremony + explicit connect
 *    approval — so accepting it is ceremony-grade trust, unlike anything
 *    relayed through the (dApp-controlled) SDK transport or dApp storage.
 *  - The iframe additionally requires the payload's dApp origin to equal the
 *    embedder origin it locked from tamper-proof browser state (see
 *    PopupCommunicator.resolveCounterpartOrigin), so a page cannot obtain a
 *    session that belongs to a different embedder via a nested iframe.
 *
 * What the handoff grants: the per-dApp session (transport ECDH keys +
 * authState) to the very dApp connection the user just approved. The dApp is
 * the peer of that encrypted channel and already holds the connect result, so
 * this reveals nothing new to it — it only spares the user a redundant
 * ceremony inside the iframe.
 *
 * Delivery is best-effort: no opener (COOP-severed), no mounted iframe, or a
 * suspended background tab simply degrades to today's reconnect + Continue-as
 * flow.
 */

import { debugLog } from './debug-log';
import type { AppSession, SessionAuthState } from './session-manager';

export const SESSION_HANDOFF_MESSAGE_TYPE = 'jaw:session-handoff';

export type SessionHandoffMessage = {
  type: typeof SESSION_HANDOFF_MESSAGE_TYPE;
  /** Plain origin of the dApp the session belongs to */
  dappOrigin: string;
  /** Full session as stored by SessionManager (keys + authState) */
  session: AppSession;
};

/** Traversal bounds: a legitimate embedder nests the keys iframe shallowly. */
const MAX_FRAME_DEPTH = 3;
const MAX_FRAMES = 32;

/**
 * Collect the frames of `root`'s tree (excluding `root` itself), depth-first,
 * bounded by depth and count. Every property access on a cross-origin window
 * can throw — each is guarded, and an unreadable subtree is skipped rather
 * than aborting the walk.
 */
function collectFrames(root: Window, maxDepth = MAX_FRAME_DEPTH, maxFrames = MAX_FRAMES): Window[] {
  const collected: Window[] = [];

  const walk = (win: Window, depth: number): void => {
    if (depth > maxDepth || collected.length >= maxFrames) return;

    let count = 0;
    try {
      count = win.length;
    } catch {
      return;
    }

    for (let i = 0; i < count && collected.length < maxFrames; i++) {
      let child: Window | null = null;
      try {
        child = win.frames[i];
      } catch {
        continue;
      }
      if (!child) continue;
      collected.push(child);
      walk(child, depth + 1);
    }
  };

  walk(root, 1);
  return collected;
}

export type SendSessionHandoffArgs = {
  /** Plain origin of the dApp the session belongs to */
  dappOrigin: string;
  /** The session to hand off (must carry authState to be useful) */
  session: AppSession;
  /** Opener override (tests); defaults to window.opener */
  opener?: Window | null;
  /** Target origin override (tests); defaults to window.location.origin */
  targetOrigin?: string;
};

/**
 * Post the session to every frame of the opener's tree, delivery restricted
 * to this same origin via `targetOrigin`. Fire-and-forget: never throws, and
 * a missing opener (standalone/embedded context, COOP) is a no-op.
 */
export function sendSessionHandoff(args: SendSessionHandoffArgs): void {
  try {
    const opener = args.opener !== undefined ? args.opener : typeof window !== 'undefined' ? window.opener : null;
    const targetOrigin = args.targetOrigin ?? (typeof window !== 'undefined' ? window.location.origin : undefined);
    if (!opener || !targetOrigin) {
      debugLog('[SessionHandoff] not sent: no opener or target origin');
      return;
    }

    const message: SessionHandoffMessage = {
      type: SESSION_HANDOFF_MESSAGE_TYPE,
      dappOrigin: args.dappOrigin,
      session: args.session,
    };

    const frames = collectFrames(opener);
    let posted = 0;
    for (const frame of frames) {
      try {
        frame.postMessage(message, targetOrigin);
        posted++;
      } catch {
        /* cross-origin quirks — skip this frame */
      }
    }
    debugLog(`[SessionHandoff] posted to ${posted}/${frames.length} opener frame(s) for`, args.dappOrigin);
  } catch {
    /* handoff is best-effort; the reconnect + Continue-as flow remains the fallback */
  }
}

export type SessionHandoffReceiverDeps = {
  /** True when this window runs inside the embedded (iframe) transport */
  isEmbedded: () => boolean;
  /** Embedder origin locked from tamper-proof browser state (null if unresolvable) */
  getEmbedderOrigin: () => string | null;
  /** Persist the session (SessionManager.importSession); null on invalid input */
  importSession: (origin: string, session: AppSession) => Promise<AppSession | null>;
  /** Seed the passkey account list so later account screens show the account */
  seedAccountList: (authState: SessionAuthState) => void;
  /** Notified after a successful import (e.g. refresh auth queries) */
  onImported?: (dappOrigin: string, authState: SessionAuthState) => void;
  /** Own-origin override (tests); defaults to window.location.origin */
  selfOrigin?: string;
};

/**
 * Build the message handler that accepts a session handoff. Every rejection
 * is silent (a message listener must never throw), and acceptance requires
 * ALL of:
 *  - running embedded,
 *  - the sender is this same origin (`event.origin`),
 *  - the payload is a handoff message carrying a session WITH authState,
 *  - the payload's dApp origin equals the locked embedder origin.
 */
export function createSessionHandoffHandler(deps: SessionHandoffReceiverDeps): (event: MessageEvent) => Promise<void> {
  return async (event: MessageEvent): Promise<void> => {
    try {
      // Cheap type discriminator first, so the (noisy) unrelated messages the
      // window receives never reach the logged rejection paths below.
      const data = event.data as Partial<SessionHandoffMessage> | null | undefined;
      if (!data || typeof data !== 'object' || data.type !== SESSION_HANDOFF_MESSAGE_TYPE) return;

      if (!deps.isEmbedded()) {
        debugLog('[SessionHandoff] rejected: not embedded');
        return;
      }

      const selfOrigin = deps.selfOrigin ?? (typeof window !== 'undefined' ? window.location.origin : undefined);
      if (!selfOrigin || event.origin !== selfOrigin) {
        debugLog('[SessionHandoff] rejected: sender origin is not this origin:', event.origin);
        return;
      }

      if (typeof data.dappOrigin !== 'string' || !data.session || typeof data.session !== 'object') {
        debugLog('[SessionHandoff] rejected: malformed payload');
        return;
      }
      // A handoff without authState cannot skip anything — reject it.
      if (!data.session.authState) {
        debugLog('[SessionHandoff] rejected: session has no authState');
        return;
      }

      const embedderOrigin = deps.getEmbedderOrigin();
      if (!embedderOrigin || embedderOrigin !== data.dappOrigin) {
        debugLog('[SessionHandoff] rejected: dApp origin', data.dappOrigin, '!= embedder origin', embedderOrigin);
        return;
      }

      // Deep shape validation lives in importSession — null means rejected.
      const imported = await deps.importSession(data.dappOrigin, data.session as AppSession);
      if (!imported?.authState) {
        debugLog('[SessionHandoff] rejected: session failed import validation');
        return;
      }
      debugLog('[SessionHandoff] session imported for', data.dappOrigin);

      try {
        deps.seedAccountList(imported.authState);
      } catch {
        // List seeding is cosmetic (account screens); the session import
        // already succeeded — don't undo it over this.
      }

      deps.onImported?.(data.dappOrigin, imported.authState);
    } catch {
      /* never throw from a message handler */
    }
  };
}

/**
 * Register the handoff listener on `win`. Returns the cleanup function.
 * NOTE: this listens on the raw window — the handoff sender is the popup,
 * not the PopupCommunicator counterpart (the parent), so the communicator's
 * source-checked channel deliberately does not apply here.
 */
export function registerSessionHandoffListener(
  deps: SessionHandoffReceiverDeps,
  win: Window | undefined = typeof window !== 'undefined' ? window : undefined
): () => void {
  if (!win) return () => undefined;
  const handler = createSessionHandoffHandler(deps);
  const listener = (event: MessageEvent): void => {
    void handler(event);
  };
  win.addEventListener('message', listener);
  return () => win.removeEventListener('message', listener);
}
