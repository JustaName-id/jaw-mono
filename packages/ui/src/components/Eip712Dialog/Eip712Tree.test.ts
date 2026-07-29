import { describe, expect, it, vi } from 'vitest';

// Eip712Tree imports SUPPORTED_CHAINS from core for the chainId branch, which these
// cases don't touch. Stub core so the test doesn't pull its source graph under node.
vi.mock('@jaw.id/core', () => ({ SUPPORTED_CHAINS: [] }));

import { formatValue } from './Eip712Tree';

const MAX_U256 = (2n ** 256n - 1n).toString();

describe('formatValue — amount name heuristic', () => {
  it('labels max-uint as "Unlimited" for shares/qty fields, not just amount/value', () => {
    expect(formatValue('uint256', MAX_U256, 'shares')).toMatchObject({ text: 'Unlimited', tone: 'far' });
    expect(formatValue('uint256', MAX_U256, 'qty')).toMatchObject({ text: 'Unlimited', tone: 'far' });
  });

  it('groups a normal shares value instead of flagging it', () => {
    expect(formatValue('uint256', '1500', 'shares').text).toBe('1,500');
  });
});

describe('formatValue — date leaf keeps the raw integer to copy', () => {
  it('exposes the unix integer as copyValue behind the formatted date', () => {
    const leaf = formatValue('uint256', '1893456000', 'deadline'); // 2030-01-01
    expect(leaf.copyValue).toBe('1893456000');
    // The visible text is a derived date, not the bare integer — hence the need to keep
    // the raw value copyable.
    expect(leaf.text).not.toBe('1893456000');
  });

  it('does not attach a copyValue to a plain grouped amount (no derived form to reveal)', () => {
    expect(formatValue('uint256', '1500', 'shares').copyValue).toBeUndefined();
  });
});
