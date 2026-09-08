import { describe, it, expect, afterEach, vi } from 'vitest';

import { buildHandleJawRpcUrl, fetchRPCRequest } from './provider.js';

describe('buildHandleJawRpcUrl', () => {
    it('appends the api-key when the caller has one', () => {
        expect(buildHandleJawRpcUrl('https://rpc.example', 'a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6')).toBe(
            'https://rpc.example/handle?api-key=a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6'
        );
    });

    // Sending `api-key=` empty would reach the proxy as a malformed key and be
    // rejected before anything else is considered, so the parameter goes away.
    it('omits the parameter entirely when there is no key', () => {
        expect(buildHandleJawRpcUrl('https://rpc.example')).toBe('https://rpc.example/handle');
        expect(buildHandleJawRpcUrl('https://rpc.example', '')).toBe('https://rpc.example/handle');
    });
});

describe('fetchRPCRequest', () => {
    afterEach(() => {
        vi.unstubAllGlobals();
    });

    function stubResponse(status: number, body: string) {
        vi.stubGlobal(
            'fetch',
            vi.fn().mockResolvedValue({
                ok: status >= 200 && status < 300,
                status,
                json: async () => JSON.parse(body),
                text: async () => body,
            })
        );
    }

    it('returns the JSON-RPC result on success', async () => {
        stubResponse(200, JSON.stringify({ result: { atomic: { status: 'supported' } } }));

        await expect(fetchRPCRequest({ method: 'wallet_getCapabilities' }, 'https://rpc.example')).resolves.toEqual({
            atomic: { status: 'supported' },
        });
    });

    it('throws the JSON-RPC error when the proxy answers with one', async () => {
        stubResponse(200, JSON.stringify({ error: { code: -32000, message: 'nope' } }));

        await expect(fetchRPCRequest({ method: 'wallet_getAssets' }, 'https://rpc.example')).rejects.toMatchObject({
            message: 'nope',
        });
    });

    // The refusal a guard sends is not a JSON-RPC envelope. Destructuring it used
    // to yield `{ result: undefined, error: undefined }` and resolve to undefined,
    // which wallet_getCapabilities then memoized for a minute.
    it('throws on a rejection instead of resolving to undefined', async () => {
        stubResponse(401, JSON.stringify({ statusCode: 401, message: 'Api key not found' }));

        await expect(fetchRPCRequest({ method: 'wallet_getCapabilities' }, 'https://rpc.example')).rejects.toThrow(
            /401/
        );
    });

    it('reports the status for a non-auth failure too', async () => {
        stubResponse(502, 'Bad Gateway');

        await expect(fetchRPCRequest({ method: 'wallet_getAssets' }, 'https://rpc.example')).rejects.toThrow(/502/);
    });

    it('still fails when the rejection body cannot be read', async () => {
        vi.stubGlobal(
            'fetch',
            vi.fn().mockResolvedValue({
                ok: false,
                status: 403,
                text: async () => {
                    throw new Error('stream already consumed');
                },
            })
        );

        await expect(fetchRPCRequest({ method: 'wallet_getPermissions' }, 'https://rpc.example')).rejects.toThrow(
            /403/
        );
    });
});
