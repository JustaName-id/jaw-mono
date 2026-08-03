import { describe, it, expect } from 'vitest';
import {
  parseOnrampEvent,
  isTerminalSuccess,
  isTerminalError,
  describeLoadError,
  ONRAMP_EVENT,
  ONRAMP_ERROR_CODE,
} from './events';

describe('onramp events', () => {
  it('parses a JSON string event', () => {
    const e = parseOnrampEvent(JSON.stringify({ eventName: 'onramp_api.polling_success', data: {} }));
    expect(e?.name).toBe('onramp_api.polling_success');
    expect(isTerminalSuccess(e!.name)).toBe(true);
  });

  it('parses an object event with error data', () => {
    const e = parseOnrampEvent({
      eventName: 'onramp_api.commit_error',
      data: { errorCode: 'X', errorMessage: 'nope' },
    });
    expect(e?.errorCode).toBe('X');
    expect(e?.errorMessage).toBe('nope');
    expect(isTerminalError(e!.name)).toBe(true);
  });

  it('ignores non-onramp messages and junk', () => {
    expect(parseOnrampEvent({ eventName: 'other' })).toBeNull();
    expect(parseOnrampEvent('not json')).toBeNull();
    expect(parseOnrampEvent(null)).toBeNull();
    expect(parseOnrampEvent(42)).toBeNull();
  });

  it('commit_success is not treated as terminal success (only polling_success is)', () => {
    expect(isTerminalSuccess('onramp_api.commit_success')).toBe(false);
  });

  it('load_error is not flow-terminal (handled as a pay-step scenario)', () => {
    expect(isTerminalError(ONRAMP_EVENT.LOAD_ERROR)).toBe(false);
    expect(isTerminalError(ONRAMP_EVENT.COMMIT_ERROR)).toBe(true);
    expect(isTerminalError(ONRAMP_EVENT.POLLING_ERROR)).toBe(true);
  });
});

describe('describeLoadError', () => {
  it('maps an expired payment link to a restart', () => {
    expect(describeLoadError(ONRAMP_ERROR_CODE.INIT).retry).toBe('restart');
    expect(describeLoadError(ONRAMP_ERROR_CODE.INVALID_REQUEST).retry).toBe('restart');
  });

  it('maps Apple Pay not set up to a reload with guidance', () => {
    const d = describeLoadError(ONRAMP_ERROR_CODE.APPLE_PAY_NOT_SETUP);
    expect(d.retry).toBe('reload');
    expect(d.message).toMatch(/Apple Pay/);
  });

  it('maps regional/device restrictions to no retry', () => {
    expect(describeLoadError(ONRAMP_ERROR_CODE.NETWORK_NOT_TRADEABLE).retry).toBe('none');
    expect(describeLoadError(ONRAMP_ERROR_CODE.ASSET_NOT_TRADABLE).retry).toBe('none');
    expect(describeLoadError(ONRAMP_ERROR_CODE.GOOGLE_PAY_NOT_SUPPORTED).retry).toBe('none');
  });

  it('prefers the localized widget message for unknown codes', () => {
    const d = describeLoadError('SOMETHING_NEW', 'Localized message');
    expect(d.message).toBe('Localized message');
    expect(d.retry).toBe('reload');
  });
});
