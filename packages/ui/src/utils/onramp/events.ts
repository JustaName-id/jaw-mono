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
// means the payment was submitted (order PROCESSING), not settled. `load_error`
// is not flow-terminal: it is a pay-step scenario (QR fallback, retry, or
// tailored guidance) resolved via `describeLoadError`.
const TERMINAL_OK = new Set<string>([ONRAMP_EVENT.POLLING_SUCCESS]);
const TERMINAL_ERR = new Set<string>([ONRAMP_EVENT.COMMIT_ERROR, ONRAMP_EVENT.POLLING_ERROR]);

export const isTerminalSuccess = (name: string): boolean => TERMINAL_OK.has(name);
export const isTerminalError = (name: string): boolean => TERMINAL_ERR.has(name);

export const ONRAMP_ERROR_CODE = {
  INIT: 'ERROR_CODE_INIT',
  APPLE_PAY_NOT_SUPPORTED: 'ERROR_CODE_GUEST_APPLE_PAY_NOT_SUPPORTED',
  APPLE_PAY_NOT_SETUP: 'ERROR_CODE_GUEST_APPLE_PAY_NOT_SETUP',
  GOOGLE_PAY_NOT_SUPPORTED: 'ERROR_CODE_GUEST_GOOGLE_PAY_NOT_SUPPORTED',
  NETWORK_NOT_TRADEABLE: 'ERROR_CODE_NETWORK_NOT_TRADEABLE',
  ASSET_NOT_TRADABLE: 'ASSET_NOT_TRADABLE',
  INTERNAL: 'ERROR_CODE_INTERNAL',
  INVALID_REQUEST: 'ERROR_CODE_INVALID_REQUEST',
} as const;

/** 'reload' re-loads the payment link, 'restart' needs a new order (back to the form), 'none' is not recoverable here. */
export type OnrampLoadRetry = 'reload' | 'restart' | 'none';

export interface OnrampLoadError {
  message: string;
  retry: OnrampLoadRetry;
}

const LOAD_ERRORS: Record<string, OnrampLoadError> = {
  [ONRAMP_ERROR_CODE.INIT]: {
    message: 'This payment link has expired. Edit your details to create a new one.',
    retry: 'restart',
  },
  [ONRAMP_ERROR_CODE.APPLE_PAY_NOT_SETUP]: {
    message: 'Apple Pay is not set up on this device. Set it up in your Wallet settings, then try again.',
    retry: 'reload',
  },
  [ONRAMP_ERROR_CODE.GOOGLE_PAY_NOT_SUPPORTED]: {
    message: 'This device does not support Google Pay.',
    retry: 'none',
  },
  [ONRAMP_ERROR_CODE.NETWORK_NOT_TRADEABLE]: {
    message: 'The selected network is not available in your region.',
    retry: 'none',
  },
  [ONRAMP_ERROR_CODE.ASSET_NOT_TRADABLE]: {
    message: 'The selected asset is not tradable in your region.',
    retry: 'none',
  },
  [ONRAMP_ERROR_CODE.INTERNAL]: {
    message: 'Something went wrong on the payment provider side. Please try again.',
    retry: 'reload',
  },
  [ONRAMP_ERROR_CODE.INVALID_REQUEST]: {
    message: 'The payment request was invalid. Edit your details and try again.',
    retry: 'restart',
  },
};

// Widget `errorMessage` is localized and user-displayable; prefer it for codes
// we have no tailored guidance for. APPLE_PAY_NOT_SUPPORTED never reaches this
// map on web: the widget falls back to a QR code instead (handled upstream).
export function describeLoadError(errorCode?: string, errorMessage?: string): OnrampLoadError {
  const known = errorCode ? LOAD_ERRORS[errorCode] : undefined;
  if (known) return known;
  return { message: errorMessage || 'Failed to load the payment option. Please try again.', retry: 'reload' };
}

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
