import { describe, it, expect, vi, beforeEach } from 'vitest';
import { JSDOM } from 'jsdom';

import { JAWProvider } from './JAWProvider.js';
import { Communicator } from '../communicator/index.js';
import { Mode, type ConstructorOptions } from './interface.js';

vi.mock('../communicator/index.js');
vi.mock('../signer/index.js', () => ({
    createSigner: vi.fn(),
    fetchSignerType: vi.fn(),
    loadSignerType: vi.fn(),
    storeSignerType: vi.fn(),
    clearSignerType: vi.fn(),
}));

// JAWProvider's prewarm wiring is browser-only — provide a window
const dom = new JSDOM('<!DOCTYPE html><html><body></body></html>', {
    url: 'https://dapp.example.com/',
});
global.window = dom.window as unknown as Window & typeof globalThis;

function createOptions(preference: ConstructorOptions['preference']): ConstructorOptions {
    return {
        metadata: { appName: 'Test App', appLogoUrl: null, defaultChainId: 1 },
        preference,
        apiKey: 'test-api-key',
    };
}

describe('JAWProvider transportMode prewarm wiring (AC-9)', () => {
    let prewarm: ReturnType<typeof vi.fn>;

    beforeEach(() => {
        prewarm = vi.fn(() => Promise.resolve());
        vi.mocked(Communicator).mockImplementation(
            () => ({ prewarm }) as unknown as Communicator
        );
    });

    it('prewarms at construction when transportMode is "iframe"', () => {
        new JAWProvider(createOptions({ transportMode: 'iframe' }));
        expect(prewarm).toHaveBeenCalledTimes(1);
    });

    it('prewarms at construction when transportMode is "auto"', () => {
        new JAWProvider(createOptions({ transportMode: 'auto' }));
        expect(prewarm).toHaveBeenCalledTimes(1);
    });

    it('does not prewarm when transportMode is unset (AC-7)', () => {
        new JAWProvider(createOptions({}));
        expect(prewarm).not.toHaveBeenCalled();
    });

    it('does not prewarm when transportMode is "popup"', () => {
        new JAWProvider(createOptions({ transportMode: 'popup' }));
        expect(prewarm).not.toHaveBeenCalled();
    });

    it('ignores transportMode in AppSpecific mode', () => {
        new JAWProvider(createOptions({ mode: Mode.AppSpecific, transportMode: 'iframe' }));
        expect(prewarm).not.toHaveBeenCalled();
    });

    it('does not break construction when prewarm rejects', async () => {
        prewarm.mockImplementation(() => Promise.reject(new Error('handshake timed out')));

        expect(() => new JAWProvider(createOptions({ transportMode: 'iframe' }))).not.toThrow();

        // Let the rejection settle — must not surface as unhandled
        await new Promise((resolve) => setTimeout(resolve, 0));
    });
});
