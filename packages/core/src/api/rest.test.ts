import { afterEach, describe, expect, it, vi } from 'vitest';

import { restCall } from './rest.js';
import { setDappOrigin } from '../dappOrigin.js';

const request = vi.fn();

vi.mock('./axiosController.js', async () => {
    const actual = await vi.importActual<typeof import('./axiosController.js')>('./axiosController.js');
    return {
        ...actual,
        backendInstance: () => ({ request }),
    };
});

// The relay calls are made from the keys origin too — grantPermissions writes
// through here — so without the header a keyless dApp's permission is refused on
// the relay write, after the transaction has already been signed and sent.
describe('restCall and the calling dApp', () => {
    afterEach(() => {
        setDappOrigin(undefined);
        request.mockReset();
    });

    function headersSent() {
        return request.mock.calls[0][0].headers as Record<string, string>;
    }

    async function callThrough(headers?: Record<string, string>) {
        request.mockResolvedValue({ data: { result: { data: {} } } });
        await restCall('GET_PERMISSION', 'GET', {}, headers, { hash: '0xabc' });
    }

    it('names the dApp alongside the key it was given', async () => {
        setDappOrigin('https://dapp.example');

        await callThrough({ 'x-api-key': 'k1' });

        expect(headersSent()).toEqual({ 'x-api-key': 'k1', 'x-dapp-origin': 'https://dapp.example' });
    });

    it('names the dApp when there is no key at all', async () => {
        setDappOrigin('https://dapp.example');

        await callThrough();

        expect(headersSent()).toEqual({ 'x-dapp-origin': 'https://dapp.example' });
    });

    it('sends no dApp header from a dApp page, where the browser sets the Origin', async () => {
        await callThrough({ 'x-api-key': 'k1' });

        expect(headersSent()).toEqual({ 'x-api-key': 'k1' });
    });
});
