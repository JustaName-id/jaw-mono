import { describe, it, expect } from 'vitest';

import { selectScreen, type Phase, type Screen } from './select-screen';
import { SDKRequestType } from './sdk-types';

/**
 * The screen decision, pinned. Each case below is a state the dialog actually
 * reached during the cold-start work — including the four that shipped broken.
 */

const MODAL_REQUESTS = [
  SDKRequestType.SIGN_MESSAGE,
  SDKRequestType.SIGN_TYPED_DATA,
  SDKRequestType.SEND_TRANSACTION,
  SDKRequestType.GRANT_PERMISSIONS,
  SDKRequestType.REVOKE_PERMISSIONS,
];

const ALL_PHASES: Phase[] = [
  'starting',
  'reading-passkeys',
  'creating-passkey',
  'choosing-account',
  'confirming-account',
  'working',
  'done',
  'failed',
];

describe('selectScreen', () => {
  describe('a signing request with an authenticated origin', () => {
    it.each(MODAL_REQUESTS)('shows the modal for %s', (requestType) => {
      expect(selectScreen({ requestType, phase: 'choosing-account', isAuthenticated: true })).toEqual({
        kind: 'modal',
      });
    });

    it.each([
      ['done', 'receipt'],
      ['failed', 'failure'],
    ] as [Phase, Screen['kind']][])('does NOT reopen the modal once %s', (phase, expected) => {
      expect(selectScreen({ requestType: SDKRequestType.SEND_TRANSACTION, phase, isAuthenticated: true })).toEqual({
        kind: expected,
      });
    });
  });

  describe('a signing request with no auth — the cold-start case', () => {
    it.each(MODAL_REQUESTS)('sends %s to onboarding, not the modal', (requestType) => {
      // Bug 1: keys kept an authState the dApp's disconnect never reached, so
      // the request went straight to the signing modal as the previous account.
      expect(selectScreen({ requestType, phase: 'choosing-account', isAuthenticated: false })).toEqual({
        kind: 'onboarding',
      });
    });

    it('shows the picker while the passkey list is being read', () => {
      expect(
        selectScreen({
          requestType: SDKRequestType.SEND_TRANSACTION,
          phase: 'confirming-account',
          isAuthenticated: false,
        })
      ).toEqual({ kind: 'onboarding' });
    });
  });

  describe('working keeps the modal, deliberately', () => {
    it('shows the modal while working even without auth', () => {
      // Once confirmed, the modal owns the screen and renders its own progress.
      // Auth can rotate away underneath it mid-flow.
      expect(
        selectScreen({ requestType: SDKRequestType.SEND_TRANSACTION, phase: 'working', isAuthenticated: false })
      ).toEqual({ kind: 'modal' });
    });

    it('falls back to the progress screen when no request is pending', () => {
      // Bug 3: a cancel leaves the phase at 'working'. With the request cleared,
      // that must NOT render a modal for a request that no longer exists.
      expect(selectScreen({ requestType: undefined, phase: 'working', isAuthenticated: false })).toEqual({
        kind: 'progress',
      });
    });
  });

  describe('non-signing requests', () => {
    it('routes an unsupported method to its own screen', () => {
      expect(
        selectScreen({ requestType: SDKRequestType.UNSUPPORTED_METHOD, phase: 'working', isAuthenticated: true })
      ).toEqual({ kind: 'unsupported' });
    });

    it.each([SDKRequestType.CONNECT, SDKRequestType.CHAIN_ID, SDKRequestType.GET_SUB_ACCOUNTS])(
      'does not claim the screen for %s',
      (requestType) => {
        // Connect is driven by the onboarding flow, not a signing modal.
        expect(selectScreen({ requestType, phase: 'choosing-account', isAuthenticated: true })).toEqual({
          kind: 'onboarding',
        });
      }
    );
  });

  describe('phase alone, with nothing pending', () => {
    it.each([
      ['starting', 'loading'],
      ['reading-passkeys', 'loading'],
      ['creating-passkey', 'onboarding'],
      ['confirming-account', 'onboarding'],
      ['choosing-account', 'onboarding'],
      ['working', 'progress'],
      ['done', 'receipt'],
      ['failed', 'failure'],
    ] as [Phase, Screen['kind']][])('%s -> %s', (phase, expected) => {
      expect(selectScreen({ requestType: undefined, phase, isAuthenticated: false })).toEqual({ kind: expected });
    });
  });

  it('always returns a screen, for every input combination', () => {
    // Exhaustive: no gap in the decision can leave the dialog with nothing to
    // render — the failure mode that produced the skeleton (bug 4).
    const types = [...MODAL_REQUESTS, SDKRequestType.CONNECT, SDKRequestType.UNSUPPORTED_METHOD, undefined];
    for (const requestType of types) {
      for (const phase of ALL_PHASES) {
        for (const isAuthenticated of [true, false]) {
          expect(selectScreen({ requestType, phase, isAuthenticated }).kind).toBeTruthy();
        }
      }
    }
  });
});
