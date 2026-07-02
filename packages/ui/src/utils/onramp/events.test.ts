import { describe, it, expect } from 'vitest';
import { parseOnrampEvent, isTerminalSuccess, isTerminalError } from './events';

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
});
