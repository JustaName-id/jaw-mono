/**
 * Golden vectors for the three permission encoders, against bytes produced
 * outside TypeScript.
 *
 * permissions.property.test.ts pins the mappings that have no compile-time link
 * to the contract, and it reads its assertions back with `decodeFunctionData`
 * over `SPEND_PERMISSIONS_MANAGER_ABI`, the same ABI the encoder used. That
 * proves the two directions agree with each other and nothing more: reorder or
 * retype a field in the local ABI and both sides move together while the
 * on-chain decode breaks.
 *
 * The `expected` here was produced by `cast calldata` with the function
 * signature copied from the Solidity, so it is the contract's own statement of
 * the encoding, selector included. See vectors/README.md for the exact commands.
 *
 * The `Permission` tuple is inlined five times in that ABI (event, approve,
 * revoke, executeBatch, getHash), so a copy can drift on its own. These cover
 * three of the five, and `executeBatch` covers the `BaseAccount.Call[]` tuple at
 * the same time.
 */
import { readFileSync } from 'node:fs';
import { describe, it, expect, afterEach, vi } from 'vitest';

import type { Address, Hex } from 'viem';

import {
    buildGrantPermissionCall,
    buildRevokePermissionCall,
    encodeExecuteBatchWithPermission,
    type Permission,
    type PermissionsDetail,
    type SpendPeriod,
    type StorePermissionApiResponse,
} from './permissions.js';

type JsonSpend = { token: Address; allowance: string; unit: SpendPeriod; multiplier: number };
type JsonPermission = {
    account: Address;
    spender: Address;
    start: number;
    end: number;
    salt: Hex;
    calls: Array<{ target: Address; selector: Hex; checker: Address }>;
    spends: JsonSpend[];
};

/**
 * Discriminated on `encoder` so a vector cannot quietly reach the wrong builder.
 * The alternative, one loose `input` bag, made a typo in that field fall through
 * to whichever branch came last and fail somewhere unrelated.
 */
type Vector = { description: string; expected: Hex } & (
    | {
          encoder: 'buildGrantPermissionCall';
          input: { account: Address; spender: Address; expiry: number; start: number; permissions: PermissionsDetail };
      }
    | { encoder: 'buildRevokePermissionCall'; input: { relayPermission: StorePermissionApiResponse } }
    | {
          encoder: 'encodeExecuteBatchWithPermission';
          input: { permission: JsonPermission; calls: Array<{ target: Address; value: string; data: Hex }> };
      }
);

/** Read rather than imported, so the vectors stay plain data with no build wiring. */
const vectors: Vector[] = JSON.parse(
    readFileSync(new URL('../../vectors/permission-calls.json', import.meta.url), 'utf8')
);

/**
 * `apiPermissionsToPermission` stamps `start` from the clock and draws `salt`
 * from `Math.random`, so the grant vectors pin those two sources rather than the
 * encoder. Everything downstream of them stays real.
 */
function withFixedStartAndSalt<T>(start: number, run: () => T): T {
    vi.useFakeTimers();
    vi.setSystemTime(start * 1000);
    // The salt is 64 nibbles of Math.random(), floored, so a constant 0 gives 0.
    const random = vi.spyOn(Math, 'random').mockReturnValue(0);
    try {
        return run();
    } finally {
        random.mockRestore();
        vi.useRealTimers();
    }
}

afterEach(() => {
    vi.useRealTimers();
});

/** The JSON carries bigints as strings, since it has to survive a round trip. */
function toPermission(permission: JsonPermission): Permission {
    return {
        ...permission,
        salt: BigInt(permission.salt),
        spends: permission.spends.map((spend) => ({ ...spend, allowance: BigInt(spend.allowance) })),
    };
}

function encode(vector: Vector): Hex {
    switch (vector.encoder) {
        case 'buildGrantPermissionCall': {
            const { account, spender, expiry, start, permissions } = vector.input;
            return withFixedStartAndSalt(
                start,
                () => buildGrantPermissionCall(account, spender, expiry, permissions).data
            );
        }
        case 'buildRevokePermissionCall':
            return buildRevokePermissionCall(vector.input.relayPermission).data;
        case 'encodeExecuteBatchWithPermission': {
            const calls = vector.input.calls.map((call) => ({ ...call, value: BigInt(call.value) }));
            return encodeExecuteBatchWithPermission(toPermission(vector.input.permission), calls);
        }
        default:
            // The union above is compile-time only, and the vectors arrive
            // through JSON.parse. Say which name is wrong rather than letting a
            // typo return undefined and fail as a byte mismatch.
            throw new Error(`Unknown encoder in permission-calls.json: ${(vector as Vector).encoder}`);
    }
}

describe('the permission calldata, against vectors from the contract signature', () => {
    it.each(vectors)('$description', (vector) => {
        expect(encode(vector)).toBe(vector.expected);
    });
});
