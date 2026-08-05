import { describe, expect, it } from 'vitest';
import { isErc20Approve } from './DecodedCalldata';
import type { DecodedParam } from '../../hooks/useDecodedCalldata';

// The "Unlimited" badge is a claim about an ERC-20 allowance. These tests pin the gate that
// keeps it off every other function — a max-uint deadline or nonce must still read as digits.
const param = (name: string, type: string): DecodedParam => ({ name, type, value: '0' });
const decoded = (functionName: string, params: DecodedParam[]) => ({
  functionName,
  signature: `${functionName}(${params.map((p) => p.type).join(', ')})`,
  params,
});

const APPROVE_PARAMS = [param('spender', 'address'), param('amount', 'uint256')];

describe('isErc20Approve', () => {
  it('accepts exactly approve(address, uint256)', () => {
    expect(isErc20Approve(decoded('approve', APPROVE_PARAMS))).toBe(true);
  });

  it('rejects other functions with the same param shape', () => {
    expect(isErc20Approve(decoded('transfer', APPROVE_PARAMS))).toBe(false);
    expect(isErc20Approve(decoded('transferFrom', APPROVE_PARAMS))).toBe(false);
    // Not ERC-20 approve: a bool second arg (ERC-721 setApprovalForAll shape).
    expect(
      isErc20Approve(decoded('setApprovalForAll', [param('operator', 'address'), param('approved', 'bool')]))
    ).toBe(false);
  });

  it('rejects an approve whose arity or types differ', () => {
    expect(isErc20Approve(decoded('approve', [param('spender', 'address')]))).toBe(false);
    expect(isErc20Approve(decoded('approve', [...APPROVE_PARAMS, param('deadline', 'uint256')]))).toBe(false);
    expect(isErc20Approve(decoded('approve', [param('amount', 'uint256'), param('spender', 'address')]))).toBe(false);
    expect(isErc20Approve(decoded('approve', [param('spender', 'address'), param('id', 'uint160')]))).toBe(false);
    expect(isErc20Approve(decoded('approve', [param('spender', 'address'), param('amount', 'unknown')]))).toBe(false);
  });

  it('rejects a missing decode', () => {
    expect(isErc20Approve(null)).toBe(false);
  });
});
