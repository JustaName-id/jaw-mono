/**
 * Promise-based RPC helper for the popup's chrome.runtime port.
 *
 * The popup is a long-lived port consumer (`PORT_NAME_POPUP`). It can post
 * `rpc-request` envelopes to the background, which forwards them to the
 * offscreen SDK and routes the matching `rpc-response` back. This helper
 * generates an id per call, registers a one-shot listener, and resolves or
 * rejects based on the response envelope.
 *
 * Trust note: requests originating from this popup are recorded by the
 * background with `kind: 'popup'` in `requestOrigins` — same flow content
 * scripts use. The popup is part of the extension surface (not an untrusted
 * dApp), so no additional auth is required at the message-passing layer.
 */

import type { AnyMessage, RpcResponse } from '../../shared/messages.js';
import { newId } from '../../shared/messages.js';

export class RpcError extends Error {
  readonly code: number;
  readonly data: unknown;
  constructor(code: number, message: string, data?: unknown) {
    super(message);
    this.name = 'RpcError';
    this.code = code;
    this.data = data;
  }
}

interface Pending {
  resolve: (value: unknown) => void;
  reject: (err: unknown) => void;
  timer: number;
}

const DEFAULT_TIMEOUT_MS = 60_000;

/**
 * Sends a JSON-RPC request over an existing popup port.
 *
 * The single shared listener on `port.onMessage` dispatches responses by id.
 * Callers should attach `installRpcListener(port)` once per port lifecycle.
 */
export function sendRpc<T = unknown>(
  port: chrome.runtime.Port,
  method: string,
  params?: readonly unknown[] | object,
  timeoutMs = DEFAULT_TIMEOUT_MS
): Promise<T> {
  const pending = getPendingMap(port);
  const id = newId();
  return new Promise<T>((resolve, reject) => {
    const timer = window.setTimeout(() => {
      if (pending.has(id)) {
        pending.delete(id);
        reject(new RpcError(-32603, `Request timed out (${method})`));
      }
    }, timeoutMs);
    pending.set(id, {
      resolve: resolve as (value: unknown) => void,
      reject,
      timer,
    });
    try {
      port.postMessage({ kind: 'rpc-request', id, method, params });
    } catch (err) {
      pending.delete(id);
      window.clearTimeout(timer);
      reject(err);
    }
  });
}

const PENDING_BY_PORT: WeakMap<chrome.runtime.Port, Map<string, Pending>> = new WeakMap();

function getPendingMap(port: chrome.runtime.Port): Map<string, Pending> {
  let map = PENDING_BY_PORT.get(port);
  if (!map) {
    map = new Map();
    PENDING_BY_PORT.set(port, map);
  }
  return map;
}

/**
 * Installs a shared dispatcher so multiple in-flight RPCs over the same port
 * route to the right promise. Returns a cleanup that removes the listener and
 * rejects all outstanding promises with a "port closed" error.
 */
export function installRpcListener(port: chrome.runtime.Port): () => void {
  const pending = getPendingMap(port);
  const handler = (message: AnyMessage): void => {
    if (message.kind !== 'rpc-response') return;
    const entry = pending.get(message.id);
    if (!entry) return;
    pending.delete(message.id);
    window.clearTimeout(entry.timer);
    const response = message as RpcResponse;
    if (response.error) {
      entry.reject(new RpcError(response.error.code, response.error.message, response.error.data));
    } else {
      entry.resolve(response.result);
    }
  };
  port.onMessage.addListener(handler);
  return () => {
    port.onMessage.removeListener(handler);
    for (const [, entry] of pending) {
      window.clearTimeout(entry.timer);
      entry.reject(new RpcError(-32603, 'Port closed'));
    }
    pending.clear();
  };
}
