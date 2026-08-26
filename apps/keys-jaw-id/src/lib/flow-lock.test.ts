import { describe, it, expect } from 'vitest';

import { createFlowLock } from './flow-lock';
import type { Phase } from './select-screen';

/**
 * The one-request-at-a-time rule, pinned. Each case is a sequence the dialog
 * actually walks. These cover the lock only — which handler exit claims it and
 * which lets go lives in page.tsx's message listener, which this cannot see.
 */

/** Every phase that is not terminal: none of them may rescue a held lock. */
const LIVE_PHASES: Phase[] = [
  'starting',
  'reading-passkeys',
  'creating-passkey',
  'choosing-account',
  'confirming-account',
  'working',
];

describe('createFlowLock', () => {
  it('starts free, so the first request of a session finds the screen reusable', () => {
    const lock = createFlowLock();

    expect(lock.isOpen()).toBe(false);
    // 'starting' is the initial phase — a cold start is finished-by-default
    // because no flow has ever owned the screen.
    expect(lock.isFinished('starting')).toBe(true);
  });

  it('refuses a second request while the first is still unanswered', () => {
    const lock = createFlowLock();
    lock.claim();

    expect(lock.isOpen()).toBe(true);
  });

  it.each(LIVE_PHASES)('holds the screen against a newcomer during phase %s', (phase) => {
    const lock = createFlowLock();
    lock.claim();

    expect(lock.isFinished(phase)).toBe(false);
  });

  it('counts a flow as finished the moment it is answered, not when its tick ends', () => {
    const lock = createFlowLock();
    lock.claim();
    // onApprove hands the response off and lets go; the modal stays up showing
    // the delivered tick, so the phase is still 'working'.
    lock.release();

    expect(lock.isFinished('working')).toBe(true);
  });

  it.each<Phase>(['done', 'failed'])('treats phase %s as finished even if nothing released the lock', (phase) => {
    const lock = createFlowLock();
    lock.claim();
    // The effect that releases on a terminal phase is passive. A request
    // arriving before it flushes must still see the flow as over, or the gate
    // refuses it and the dialog wedges.
    expect(lock.isFinished(phase)).toBe(true);
  });

  it('reopens for the request that follows a completed one', () => {
    const lock = createFlowLock();
    lock.claim();
    lock.release();
    lock.claim();

    expect(lock.isOpen()).toBe(true);
    expect(lock.isFinished('working')).toBe(false);
  });

  it('stays released when a flow ends through more than one route', () => {
    const lock = createFlowLock();
    lock.claim();
    // onApprove releases, then the terminal-phase effect releases again — the
    // real ordering on every successful flow.
    lock.release();
    lock.release();

    expect(lock.isOpen()).toBe(false);
  });
});
