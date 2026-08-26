import type { Phase } from './select-screen';

/**
 * The dialog serves one request at a time, and this is how it knows.
 *
 * Held from the moment a request reaches a handler until whatever answers it
 * lets go — onApprove, onReject, a failure, or the user walking away. A
 * handshake arriving while it is held is refused (-32002) instead of served:
 * serving it would rotate the peer key out from under the live flow and replace
 * its pendingRequest, closures included, and neither side times out, so that
 * flow would simply never settle.
 *
 * A boolean behind a closure rather than React state, because handshakes arrive
 * as concurrent async handlers and state lands a commit too late to gate them.
 */
export interface FlowLock {
  /** Take the lock for a request that is about to own the screen. */
  claim(): void;
  /** Let go — the request was answered, failed, or abandoned. */
  release(): void;
  /** Whether a request currently owns the screen. */
  isOpen(): boolean;
  /**
   * Whether the flow on screen is over, so the next request may reset it.
   *
   * The lock answers it: onApprove and onReject let go as they hand the
   * response off, which is when a flow stops owning the screen — well before
   * its modal stops showing the delivered tick. `phase` cannot express that on
   * its own, since 'done' is both the terminal marker and what unmounts the
   * modal, so setting it would cut the tick short.
   *
   * The phase terms are the same fact read synchronously. The effect that
   * releases the lock on a terminal phase is passive, so a request arriving
   * before it flushes would otherwise still read the lock as held.
   */
  isFinished(phase: Phase): boolean;
}

export function createFlowLock(): FlowLock {
  let open = false;

  return {
    claim: () => {
      open = true;
    },
    release: () => {
      open = false;
    },
    isOpen: () => open,
    isFinished: (phase) => !open || phase === 'done' || phase === 'failed',
  };
}
