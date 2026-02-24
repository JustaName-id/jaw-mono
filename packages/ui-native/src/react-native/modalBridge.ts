/**
 * Module-level singleton bridge between ReactNativeUIHandler (imperative)
 * and JAWModalRoot (declarative React component).
 *
 * Same pattern as react-native-toast-message / react-native-flash-message:
 * a plain TS module holds state and callbacks so the class and the component
 * can communicate without a React context provider.
 */

import type {
  UIHandlerConfig,
  UIRequest,
  UIResponse,
} from '@jaw.id/core';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ModalState {
  type: string;
  request: UIRequest;
  resolve: (response: UIResponse<unknown>) => void;
  reject: (error: Error) => void;
}

export interface ModalController {
  show: (state: ModalState, config: UIHandlerConfig) => void;
  hide: () => void;
}

interface PendingRequest {
  state: ModalState;
  timer: ReturnType<typeof setTimeout>;
}

// ---------------------------------------------------------------------------
// Bridge state (module-scoped singleton)
// ---------------------------------------------------------------------------

let controller: ModalController | null = null;
let configGetter: (() => UIHandlerConfig) | null = null;
const pendingRequests: PendingRequest[] = [];

const MOUNT_TIMEOUT_MS = 10_000;

// ---------------------------------------------------------------------------
// Controller registration (called by JAWModalRoot)
// ---------------------------------------------------------------------------

export function registerController(ctrl: ModalController): void {
  controller = ctrl;
  flushPending();
}

export function unregisterController(): void {
  controller = null;
}

// ---------------------------------------------------------------------------
// Config getter registration (called by ReactNativeUIHandler.init)
// ---------------------------------------------------------------------------

export function registerConfigGetter(fn: () => UIHandlerConfig): void {
  configGetter = fn;
}

export function getConfig(): UIHandlerConfig | null {
  return configGetter ? configGetter() : null;
}

// ---------------------------------------------------------------------------
// Modal control (called by ReactNativeUIHandler)
// ---------------------------------------------------------------------------

export function showModal(state: ModalState): void {
  const config = getConfig();

  if (controller && config) {
    controller.show(state, config);
    return;
  }

  // Component not mounted yet -- queue with timeout
  const timer = setTimeout(() => {
    removePending(state);
    state.reject(
      new Error(
        'ReactNativeUIHandler: JAWModalRoot did not mount within 10 seconds. ' +
          'Make sure <JAWModalRoot /> is rendered in your app layout.'
      )
    );
  }, MOUNT_TIMEOUT_MS);

  pendingRequests.push({ state, timer });
}

export function hideModal(): void {
  controller?.hide();
}

/**
 * Called by JAWModalRoot after a modal is dismissed to show the next queued
 * request, if any.
 */
export function showNextPending(): void {
  flushPending();
}

// ---------------------------------------------------------------------------
// Internals
// ---------------------------------------------------------------------------

function flushPending(): void {
  if (!controller) return;

  const config = getConfig();
  if (!config) return;

  const next = pendingRequests.shift();
  if (!next) return;

  clearTimeout(next.timer);
  controller.show(next.state, config);
}

function removePending(state: ModalState): void {
  const idx = pendingRequests.findIndex((p) => p.state === state);
  if (idx !== -1) {
    clearTimeout(pendingRequests[idx].timer);
    pendingRequests.splice(idx, 1);
  }
}
