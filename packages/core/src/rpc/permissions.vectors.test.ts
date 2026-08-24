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

import {
    buildGrantPermissionCall,
    buildRevokePermissionCall,
    encodeExecuteBatchWithPermission,
    type Permission,
    type PermissionsDetail,
    type StorePermissionApiResponse,
} from './permissions.js';

/** Read rather than imported, so the vectors stay plain data with no build wiring. */
const vectors: Vector[] = JSON.parse(
    readFileSync(new URL('../../vectors/permission-calls.json', import.meta.url), 'utf8')
);

type Vector = { description: string; encoder: string; input: Record<string, any>; expected: string };

/**
 * `apiPermissionsToPermission` stamps `start` from the clock and draws `salt`
 * from `Math.random`, so the grant vectors pin those two sources rather than the
 * encoder. Everything downstream of them stays real.
 */
function withFixedStartAndSalt(start: number, run: () => void) {
    vi.useFakeTimers();
    vi.setSystemTime(start * 1000);
    // 64 nibbles of Math.random(), floored, so a constant 0 gives salt 0.
    const random = vi.spyOn(Math, 'random').mockReturnValue(0);
    try {
        run();
    } finally {
        random.mockRestore();
        vi.useRealTimers();
    }
}

afterEach(() => {
    vi.useRealTimers();
});

function encode(vector: Vector): string {
    const { encoder, input } = vector;

    if (encoder === 'buildGrantPermissionCall') {
        let data = '';
        withFixedStartAndSalt(input.start, () => {
            data = buildGrantPermissionCall(
                input.account,
                input.spender,
                input.expiry,
                input.permissions as PermissionsDetail
            ).data;
        });
        return data;
    }

    if (encoder === 'buildRevokePermissionCall') {
        return buildRevokePermissionCall(input.relayPermission as StorePermissionApiResponse).data;
    }

    const permission = {
        ...input.permission,
        salt: BigInt(input.permission.salt),
        spends: input.permission.spends.map((spend: { allowance: string }) => ({
            ...spend,
            allowance: BigInt(spend.allowance),
        })),
    } as Permission;

    const calls = input.calls.map((call: { target: string; value: string; data: string }) => ({
        target: call.target as `0x${string}`,
        value: BigInt(call.value),
        data: call.data as `0x${string}`,
    }));

    return encodeExecuteBatchWithPermission(permission, calls);
}

describe('the permission calldata, against vectors from the contract signature', () => {
    it.each(vectors)('$description', (vector) => {
        expect(encode(vector)).toBe(vector.expected);
    });
});
