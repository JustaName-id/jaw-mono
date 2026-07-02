// Coinbase Headless Onramp emits post-message events namespaced `onramp_api.*`
// from the embedded pay widget. See CDP "Headless Onramp" docs (post message
// events + order lifecycle).

export interface OnrampWidgetEvent {
  name: string;
  errorCode?: string;
  errorMessage?: string;
}

export const ONRAMP_EVENT = {
  LOAD_PENDING: 'onramp_api.load_pending',
  LOAD_SUCCESS: 'onramp_api.load_success',
  LOAD_ERROR: 'onramp_api.load_error',
  COMMIT_SUCCESS: 'onramp_api.commit_success',
  COMMIT_ERROR: 'onramp_api.commit_error',
  POLLING_SUCCESS: 'onramp_api.polling_success',
  POLLING_ERROR: 'onramp_api.polling_error',
  CANCEL: 'onramp_api.cancel',
} as const;

// `polling_success` is the only terminal success: funds delivered. `commit_success`
// means the payment was submitted (order PROCESSING), not settled.
const TERMINAL_OK = new Set<string>([ONRAMP_EVENT.POLLING_SUCCESS]);
const TERMINAL_ERR = new Set<string>([ONRAMP_EVENT.LOAD_ERROR, ONRAMP_EVENT.COMMIT_ERROR, ONRAMP_EVENT.POLLING_ERROR]);

export const isTerminalSuccess = (name: string): boolean => TERMINAL_OK.has(name);
export const isTerminalError = (name: string): boolean => TERMINAL_ERR.has(name);

export function parseOnrampEvent(raw: unknown): OnrampWidgetEvent | null {
  let value: unknown = raw;
  if (typeof value === 'string') {
    try {
      value = JSON.parse(value);
    } catch {
      return null;
    }
  }
  if (!value || typeof value !== 'object') return null;
  const v = value as Record<string, unknown>;
  const name = v.eventName;
  if (typeof name !== 'string' || !name.startsWith('onramp_api.')) return null;
  const data = (v.data ?? {}) as Record<string, unknown>;
  return {
    name,
    errorCode: typeof data.errorCode === 'string' ? data.errorCode : undefined,
    errorMessage: typeof data.errorMessage === 'string' ? data.errorMessage : undefined,
  };
}
