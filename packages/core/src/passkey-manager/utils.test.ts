import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
    createPasskeyUtils,
    authenticateWithWebAuthnUtils,
    importPasskeyUtils,
    wrapNativeGetFn,
    wrapNativeCreateFn,
    WebAuthnAuthenticationError,
    PasskeyRegistrationError,
    PasskeyLookupError,
    type NativePasskeyGetFn,
    type NativePasskeyCreateFn,
} from './utils.js';

// Mock viem/account-abstraction
vi.mock('viem/account-abstraction', () => ({
    createWebAuthnCredential: vi.fn().mockResolvedValue({
        id: 'cred-standard-123',
        publicKey: '0x04standard',
    }),
    toWebAuthnAccount: vi.fn().mockReturnValue({
        type: 'webAuthn',
        publicKey: '0x04abc',
    }),
}));

// Mock the API module
vi.mock('../api/index.js', () => ({
    restCall: vi.fn().mockResolvedValue({
        passkeys: [
            {
                credentialId: 'cred-imported',
                publicKey: '0x04imported',
                displayName: 'imported-user',
            },
        ],
    }),
}));

describe('passkey-manager/utils — React Native adapter support', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    describe('createPasskeyUtils', () => {
        it('should use nativeCreateFn path when provided (bypasses crypto.subtle)', async () => {
            const { toWebAuthnAccount } = await import('viem/account-abstraction');
            const { restCall } = await import('../api/index.js');

            const mockNativeCreateFn = vi.fn().mockResolvedValue({
                id: 'native-cred-id',
                publicKey: '0x04nativepub' as `0x${string}`,
            });
            const mockGetFn = vi.fn();

            const result = await createPasskeyUtils(
                'alice',
                'example.com',
                'MyApp',
                undefined,
                mockNativeCreateFn,
                mockGetFn
            );

            expect(mockNativeCreateFn).toHaveBeenCalledWith('alice', 'example.com', 'MyApp');
            expect(result.credentialId).toBe('native-cred-id');
            expect(result.publicKey).toBe('0x04nativepub');
            expect(toWebAuthnAccount).toHaveBeenCalledWith({
                credential: { id: 'native-cred-id', publicKey: '0x04nativepub' },
                getFn: mockGetFn,
                rpId: 'example.com',
            });
            // Should NOT register with backend — registration is handled by PasskeyManager.storePasskeyAccount()
            expect(restCall).not.toHaveBeenCalled();
        });

        it('should use createFn path when provided (custom WebAuthn create)', async () => {
            const { createWebAuthnCredential, toWebAuthnAccount } = await import('viem/account-abstraction');

            await createPasskeyUtils(
                'bob',
                'example.com',
                'MyApp',
                vi.fn(), // custom createFn
                undefined,
                vi.fn() // custom getFn
            );

            // Should pass createFn to createWebAuthnCredential
            expect(createWebAuthnCredential).toHaveBeenCalledWith(
                expect.objectContaining({
                    createFn: expect.any(Function),
                })
            );
            // Should pass getFn and rpId to toWebAuthnAccount
            expect(toWebAuthnAccount).toHaveBeenCalledWith(
                expect.objectContaining({
                    getFn: expect.any(Function),
                    rpId: 'example.com',
                })
            );
        });

        it('should throw PasskeyRegistrationError when no WebAuthn support and no createFn', async () => {
            // In test env, window.PublicKeyCredential is not available
            await expect(createPasskeyUtils('charlie', 'example.com', 'MyApp')).rejects.toThrow(
                PasskeyRegistrationError
            );
        });

        it('should not throw for missing WebAuthn when createFn is provided', async () => {
            const mockCreateFn = vi.fn();
            // Should not throw even without window.PublicKeyCredential
            await expect(createPasskeyUtils('charlie', 'example.com', 'MyApp', mockCreateFn)).resolves.toBeDefined();
        });
    });

    describe('authenticateWithWebAuthnUtils', () => {
        it('should use custom getFn when provided instead of navigator.credentials.get', async () => {
            const mockCredential = {
                id: 'cred-123',
                type: 'public-key',
                rawId: new ArrayBuffer(32),
                response: {},
                getClientExtensionResults: () => ({}),
                authenticatorAttachment: null,
            };
            const mockGetFn = vi.fn().mockResolvedValue(mockCredential);

            const result = await authenticateWithWebAuthnUtils(
                'example.com',
                'dGVzdA', // base64url for "test"
                undefined,
                mockGetFn
            );

            expect(mockGetFn).toHaveBeenCalledWith(
                expect.objectContaining({
                    publicKey: expect.objectContaining({
                        rpId: 'example.com',
                        allowCredentials: expect.arrayContaining([expect.objectContaining({ type: 'public-key' })]),
                    }),
                })
            );
            expect(result.credential).toBe(mockCredential);
            expect(result.challenge).toBeInstanceOf(Uint8Array);
        });

        it('should skip WebAuthn environment check when getFn is provided', async () => {
            // In test env, window.PublicKeyCredential is not available
            // With getFn, it should NOT throw the environment error
            const mockGetFn = vi.fn().mockResolvedValue({
                id: 'cred-123',
                type: 'public-key',
                rawId: new ArrayBuffer(0),
                response: {},
                getClientExtensionResults: () => ({}),
                authenticatorAttachment: null,
            });

            await expect(
                authenticateWithWebAuthnUtils('example.com', 'dGVzdA', undefined, mockGetFn)
            ).resolves.toBeDefined();
        });

        it('should throw WebAuthnAuthenticationError without getFn in non-browser env', async () => {
            await expect(authenticateWithWebAuthnUtils('example.com', 'dGVzdA')).rejects.toThrow(
                WebAuthnAuthenticationError
            );
            await expect(authenticateWithWebAuthnUtils('example.com', 'dGVzdA')).rejects.toThrow(
                'WebAuthn is not supported in this environment'
            );
        });

        it('should throw when getFn returns null', async () => {
            const mockGetFn = vi.fn().mockResolvedValue(null);

            await expect(authenticateWithWebAuthnUtils('example.com', 'dGVzdA', undefined, mockGetFn)).rejects.toThrow(
                'Failed to authenticate with specified passkey'
            );
        });

        it('should wrap getFn errors in WebAuthnAuthenticationError', async () => {
            const mockGetFn = vi.fn().mockRejectedValue(new Error('RN passkey error'));

            await expect(authenticateWithWebAuthnUtils('example.com', 'dGVzdA', undefined, mockGetFn)).rejects.toThrow(
                WebAuthnAuthenticationError
            );
            await expect(authenticateWithWebAuthnUtils('example.com', 'dGVzdA', undefined, mockGetFn)).rejects.toThrow(
                'RN passkey error'
            );
        });

        it('should pass custom options (userVerification, timeout, transports)', async () => {
            const mockGetFn = vi.fn().mockResolvedValue({
                id: 'cred-123',
                type: 'public-key',
                rawId: new ArrayBuffer(0),
                response: {},
                getClientExtensionResults: () => ({}),
                authenticatorAttachment: null,
            });

            await authenticateWithWebAuthnUtils(
                'example.com',
                'dGVzdA',
                {
                    userVerification: 'required',
                    timeout: 30000,
                    transports: ['ble'],
                },
                mockGetFn
            );

            const callArgs = mockGetFn.mock.calls[0][0];
            expect(callArgs.publicKey.userVerification).toBe('required');
            expect(callArgs.publicKey.timeout).toBe(30000);
            expect(callArgs.publicKey.allowCredentials[0].transports).toEqual(['ble']);
        });
    });

    describe('importPasskeyUtils', () => {
        it('should use custom getFn when provided', async () => {
            const mockCredential = {
                id: 'imported-cred-id',
                type: 'public-key',
                rawId: new ArrayBuffer(0),
                response: {},
                getClientExtensionResults: () => ({}),
                authenticatorAttachment: null,
            };
            const mockGetFn = vi.fn().mockResolvedValue(mockCredential);

            const result = await importPasskeyUtils(mockGetFn, 'example.com');

            expect(mockGetFn).toHaveBeenCalledWith(
                expect.objectContaining({
                    publicKey: expect.objectContaining({
                        userVerification: 'preferred',
                        timeout: 60000,
                        rpId: 'example.com',
                    }),
                })
            );
            expect(result.credential.id).toBe('imported-cred-id');
        });

        it('should include rpId in publicKeyOptions when provided', async () => {
            const mockGetFn = vi.fn().mockResolvedValue({
                id: 'cred-id',
                type: 'public-key',
                rawId: new ArrayBuffer(0),
                response: {},
                getClientExtensionResults: () => ({}),
                authenticatorAttachment: null,
            });

            await importPasskeyUtils(mockGetFn, 'myapp.com');

            const callArgs = mockGetFn.mock.calls[0][0];
            expect(callArgs.publicKey.rpId).toBe('myapp.com');
        });

        it('should throw when getFn returns null', async () => {
            const mockGetFn = vi.fn().mockResolvedValue(null);

            await expect(importPasskeyUtils(mockGetFn, 'example.com')).rejects.toThrow(PasskeyLookupError);
        });

        it('should throw when getFn rejects', async () => {
            const mockGetFn = vi.fn().mockRejectedValue(new Error('RN error'));

            await expect(importPasskeyUtils(mockGetFn, 'example.com')).rejects.toThrow(PasskeyLookupError);
        });

        it('should throw when rpId is missing in non-browser environment', async () => {
            const originalWindow = globalThis.window;
            // @ts-expect-error - simulating non-browser environment
            delete globalThis.window;

            try {
                const mockGetFn = vi.fn();
                await expect(importPasskeyUtils(mockGetFn)).rejects.toThrow(
                    'rpId is required in non-browser environments'
                );
            } finally {
                globalThis.window = originalWindow;
            }
        });
    });

    describe('wrapNativeGetFn', () => {
        it('should convert ArrayBuffer options to base64url and base64url response back to ArrayBuffer', async () => {
            const challenge = new Uint8Array([1, 2, 3, 4]);
            const credId = new Uint8Array([10, 20, 30]);

            const mockNativeGetFn: NativePasskeyGetFn = vi.fn().mockResolvedValue({
                id: 'native-cred-id',
                type: 'public-key',
                response: {
                    authenticatorData: 'AQID', // base64url for [1,2,3]
                    clientDataJSON: 'BAUG', // base64url for [4,5,6]
                    signature: 'BwgJ', // base64url for [7,8,9]
                },
            });

            const wrappedGetFn = wrapNativeGetFn(mockNativeGetFn);

            const result = (await wrappedGetFn({
                publicKey: {
                    challenge: challenge.buffer,
                    rpId: 'example.com',
                    allowCredentials: [{ type: 'public-key', id: credId.buffer, transports: ['internal'] }],
                    userVerification: 'preferred',
                    timeout: 60000,
                },
            })) as {
                id: string;
                type: string;
                response: Record<string, ArrayBuffer>;
            };

            // Verify the native fn received base64url strings
            const nativeCall = vi.mocked(mockNativeGetFn).mock.calls[0][0];
            expect(typeof nativeCall.challenge).toBe('string');
            expect(nativeCall.rpId).toBe('example.com');
            expect(typeof nativeCall.allowCredentials![0].id).toBe('string');
            expect(nativeCall.userVerification).toBe('preferred');
            expect(nativeCall.timeout).toBe(60000);

            // Verify the response was converted back to ArrayBuffers
            expect(result.id).toBe('native-cred-id');
            expect(result.type).toBe('public-key');
            expect(result.response.authenticatorData).toBeInstanceOf(ArrayBuffer);
            expect(result.response.clientDataJSON).toBeInstanceOf(ArrayBuffer);
            expect(result.response.signature).toBeInstanceOf(ArrayBuffer);

            // Verify round-trip: base64url "AQID" should decode to [1,2,3]
            expect(new Uint8Array(result.response.authenticatorData)).toEqual(new Uint8Array([1, 2, 3]));
        });

        it("should default type to 'public-key' when not provided by native fn", async () => {
            const mockNativeGetFn: NativePasskeyGetFn = vi.fn().mockResolvedValue({
                id: 'cred',
                // type omitted
                response: {
                    authenticatorData: 'AA',
                    clientDataJSON: 'AA',
                    signature: 'AA',
                },
            });

            const wrappedGetFn = wrapNativeGetFn(mockNativeGetFn);
            const result = (await wrappedGetFn({
                publicKey: {
                    challenge: new Uint8Array(1).buffer,
                    rpId: 'example.com',
                },
            })) as { type: string };

            expect(result.type).toBe('public-key');
        });

        it('should throw when publicKey options are missing', async () => {
            const mockNativeGetFn: NativePasskeyGetFn = vi.fn();
            const wrappedGetFn = wrapNativeGetFn(mockNativeGetFn);

            await expect(wrappedGetFn({})).rejects.toThrow('publicKey options are required');
            expect(mockNativeGetFn).not.toHaveBeenCalled();
        });
    });

    describe('wrapNativeCreateFn', () => {
        // Minimal attestation object with COSE key markers:
        // 0x21 0x58 0x20 <32-byte x> and 0x22 0x58 0x20 <32-byte y>
        const ATTESTATION_B64URL =
            'oKGiIVggAQIDBAUGBwgJCgsMDQ4PEBESExQVFhcYGRobHB0eHyAiWCAhIiMkJSYnKCkqKywtLi8wMTIzNDU2Nzg5Ojs8PT4_QA';
        // 64-byte raw P-256 key (x || y), no SEC1 0x04 prefix — matches viem's
        // browser createWebAuthnCredential and what JustanAccount's MultiOwnable expects.
        const EXPECTED_PUBKEY =
            '0x0102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f202122232425262728292a2b2c2d2e2f303132333435363738393a3b3c3d3e3f40';

        it('should pass correct options to native create fn and extract public key from attestation', async () => {
            const mockNativeCreateFn: NativePasskeyCreateFn = vi.fn().mockResolvedValue({
                id: 'new-cred-id',
                response: {
                    attestationObject: ATTESTATION_B64URL,
                    clientDataJSON: 'e30', // "{}" in base64url
                },
            });

            const wrappedCreateFn = wrapNativeCreateFn(mockNativeCreateFn);
            const result = await wrappedCreateFn('alice', 'example.com', 'MyApp');

            // Verify native fn received correct structure
            const nativeCall = vi.mocked(mockNativeCreateFn).mock.calls[0][0];
            expect(typeof nativeCall.challenge).toBe('string');
            expect(nativeCall.challenge.length).toBeGreaterThan(0);
            expect(nativeCall.rp).toEqual({ id: 'example.com', name: 'MyApp' });
            expect(nativeCall.user.name).toBe('alice');
            expect(nativeCall.user.displayName).toBe('alice');
            expect(typeof nativeCall.user.id).toBe('string'); // base64url-encoded username
            expect(nativeCall.pubKeyCredParams).toEqual([{ type: 'public-key', alg: -7 }]);

            // Verify extracted result
            expect(result.id).toBe('new-cred-id');
            expect(result.publicKey).toBe(EXPECTED_PUBKEY);
        });

        it('should throw PasskeyRegistrationError for invalid attestation (missing COSE markers)', async () => {
            const mockNativeCreateFn: NativePasskeyCreateFn = vi.fn().mockResolvedValue({
                id: 'bad-cred',
                response: {
                    attestationObject: 'AQIDBA', // garbage bytes, no COSE markers
                    clientDataJSON: 'e30',
                },
            });

            const wrappedCreateFn = wrapNativeCreateFn(mockNativeCreateFn);

            await expect(wrappedCreateFn('alice', 'example.com', 'MyApp')).rejects.toThrow(
                'Failed to extract public key from attestationObject'
            );
        });
    });

    describe('error classes', () => {
        it('WebAuthnAuthenticationError should have correct name and cause', () => {
            const cause = new Error('root cause');
            const error = new WebAuthnAuthenticationError('auth failed', cause);
            expect(error.name).toBe('WebAuthnAuthenticationError');
            expect(error.message).toBe('auth failed');
            expect(error.cause).toBe(cause);
        });

        it('PasskeyRegistrationError should have correct name', () => {
            const error = new PasskeyRegistrationError('reg failed');
            expect(error.name).toBe('PasskeyRegistrationError');
        });

        it('PasskeyLookupError should have correct name', () => {
            const error = new PasskeyLookupError('lookup failed');
            expect(error.name).toBe('PasskeyLookupError');
        });
    });
});
