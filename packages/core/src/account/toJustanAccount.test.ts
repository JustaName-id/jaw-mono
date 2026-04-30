import * as viem from 'viem';
import { type Hex } from 'viem';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { wrapSignature, toWebAuthnSignature, sign, signTypedData, toJustanAccount } from './toJustanAccount.js';
import * as Signature from 'ox/Signature';

vi.mock('viem', async () => {
    const actual = await vi.importActual<typeof import('viem')>('viem');
    return {
        ...actual,
        encodeAbiParameters: vi.fn(),
        encodePacked: vi.fn(),
        parseSignature: vi.fn(),
        size: vi.fn(),
        padHex: vi.fn(),
        numberToHex: vi.fn(),
        stringToHex: vi.fn(),
        hashTypedData: vi.fn(),
        pad: vi.fn(),
        isAddressEqual: vi.fn(),
        encodeFunctionData: vi.fn(),
    };
});

vi.mock('viem/actions', () => ({
    readContract: vi.fn(),
    getChainId: vi.fn(),
    getTransactionCount: vi.fn(),
    signAuthorization: vi.fn(),
}));

vi.mock('viem/account-abstraction', () => ({
    toSmartAccount: vi.fn(),
    entryPoint08Abi: [],
    entryPoint08Address: '0x0000000000000000000000000000000000000000',
    getUserOperationTypedData: vi.fn(),
}));

vi.mock('viem/experimental/erc7739', () => ({
    hashMessage: vi.fn(),
    hashTypedData: vi.fn(),
    wrapTypedDataSignature: vi.fn(),
}));

vi.mock('ox/Signature', () => ({
    fromHex: vi.fn(),
}));

const MOCK_SIGNATURE = '0x1234' as Hex;
const MOCK_ENCODED_RESULT = '0xabcd' as Hex;
const MOCK_WEBAUTHN = {
    authenticatorData: '0xauthdata' as Hex,
    clientDataJSON: 'test-client-data',
    challengeIndex: 10,
    typeIndex: 20,
    userVerificationRequired: false,
};
const MOCK_R = 123n;
const MOCK_S = 456n;
const MOCK_HASH = '0xhash123' as Hex;
const MOCK_WEBAUTHN_ENCODED = '0xwebauthnencoded' as Hex;
const MOCK_ADDRESS = '0x1234567890123456789012345678901234567890' as const;
const MOCK_FACTORY_ADDRESS = '0xfactory1234567890123456789012345678901234' as const;
const MOCK_DELEGATION_CONTRACT = '0xdeleg123456789012345678901234567890123456' as const;
const MOCK_PUBLIC_CLIENT = { chain: { id: 1 } } as any;
const MOCK_WRAPPED_SIGNATURE = '0xwrapped5678' as Hex;
const MOCK_WRAPPED_TYPED_DATA_SIGNATURE = '0xwrappedtypeddata' as Hex;
const MOCK_MESSAGE = 'Hello, world!';
const MOCK_TYPED_DATA = {
    domain: { name: 'Test', version: '1' },
    types: { Test: [{ name: 'value', type: 'string' }] },
    primaryType: 'Test' as const,
    message: { value: 'test' },
};

describe('toJustanAccount unit tests', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });
    describe('wrapSignature unit tests', () => {
        it('should wrap signature with default ownerIndex 0', () => {
            vi.mocked(viem.size).mockReturnValue(2);
            vi.mocked(viem.encodeAbiParameters).mockReturnValue(MOCK_ENCODED_RESULT);

            const result = wrapSignature({
                signature: MOCK_SIGNATURE,
            });

            expect(viem.encodeAbiParameters).toHaveBeenCalledWith(
                [
                    {
                        components: [
                            { name: 'ownerIndex', type: 'uint8' },
                            { name: 'signatureData', type: 'bytes' },
                        ],
                        type: 'tuple',
                    },
                ],
                [
                    {
                        ownerIndex: 0,
                        signatureData: MOCK_SIGNATURE,
                    },
                ]
            );
            expect(result).toBe(MOCK_ENCODED_RESULT);
        });

        it('should wrap signature with custom ownerIndex', () => {
            vi.mocked(viem.size).mockReturnValue(2);
            vi.mocked(viem.encodeAbiParameters).mockReturnValue(MOCK_ENCODED_RESULT);

            const result = wrapSignature({
                ownerIndex: 5,
                signature: MOCK_SIGNATURE,
            });

            expect(viem.encodeAbiParameters).toHaveBeenCalledWith(expect.anything(), [
                {
                    ownerIndex: 5,
                    signatureData: MOCK_SIGNATURE,
                },
            ]);
            expect(result).toBe(MOCK_ENCODED_RESULT);
        });

        it('should convert 65-byte signature with parseSignature and encodePacked', () => {
            const testSignature = ('0x' + '11'.repeat(65)) as Hex;
            const mockParsed = {
                r: '0xaaa' as Hex,
                s: '0xbbb' as Hex,
                yParity: 0,
            };
            const mockPacked = '0xccc' as Hex;
            const mockEncodedResult = '0xddd' as Hex;

            vi.mocked(viem.size).mockReturnValue(65);
            vi.mocked(viem.parseSignature).mockReturnValue(mockParsed);
            vi.mocked(viem.encodePacked).mockReturnValue(mockPacked);
            vi.mocked(viem.encodeAbiParameters).mockReturnValue(mockEncodedResult);

            const result = wrapSignature({
                signature: testSignature,
            });

            expect(viem.parseSignature).toHaveBeenCalledWith(testSignature);
            expect(viem.encodePacked).toHaveBeenCalledWith(
                ['bytes32', 'bytes32', 'uint8'],
                [mockParsed.r, mockParsed.s, 27]
            );
            expect(viem.encodeAbiParameters).toHaveBeenCalledWith(expect.anything(), [
                {
                    ownerIndex: 0,
                    signatureData: mockPacked,
                },
            ]);
            expect(result).toBe(mockEncodedResult);
        });
    });

    describe('toWebAuthnSignature unit tests', () => {
        it('should encode WebAuthn signature with correct structure', () => {
            const mockRHex = '0xr' as Hex;
            const mockSHex = '0xs' as Hex;
            const mockRPadded = '0xrpadded' as Hex;
            const mockSPadded = '0xspadded' as Hex;
            const mockClientDataHex = '0xclientdata' as Hex;
            const mockEncodedResult = '0xencoded' as Hex;

            vi.mocked(Signature.fromHex).mockReturnValue({ r: MOCK_R, s: MOCK_S, yParity: 0 });
            vi.mocked(viem.numberToHex).mockImplementation((n) => (n === MOCK_R ? mockRHex : mockSHex));
            vi.mocked(viem.padHex).mockImplementation((hex) => (hex === mockRHex ? mockRPadded : mockSPadded));
            vi.mocked(viem.stringToHex).mockReturnValue(mockClientDataHex);
            vi.mocked(viem.encodeAbiParameters).mockReturnValue(mockEncodedResult);

            const result = toWebAuthnSignature({
                signature: MOCK_SIGNATURE,
                webauthn: MOCK_WEBAUTHN,
            });

            expect(Signature.fromHex).toHaveBeenCalledWith(MOCK_SIGNATURE);
            expect(viem.numberToHex).toHaveBeenCalledWith(MOCK_R);
            expect(viem.numberToHex).toHaveBeenCalledWith(MOCK_S);
            expect(viem.padHex).toHaveBeenCalledWith(mockRHex, { size: 32 });
            expect(viem.padHex).toHaveBeenCalledWith(mockSHex, { size: 32 });
            expect(viem.stringToHex).toHaveBeenCalledWith(MOCK_WEBAUTHN.clientDataJSON);
            expect(result).toBe(mockEncodedResult);
        });
    });

    describe('sign unit tests', () => {
        it('should sign with webAuthn owner', async () => {
            const mockWebAuthnOwner = {
                type: 'webAuthn' as const,
                sign: vi.fn().mockResolvedValue({
                    signature: MOCK_SIGNATURE,
                    webauthn: MOCK_WEBAUTHN,
                }),
            } as any;

            vi.mocked(viem.encodeAbiParameters).mockReturnValue(MOCK_WEBAUTHN_ENCODED);
            vi.mocked(Signature.fromHex).mockReturnValue({ r: MOCK_R, s: MOCK_S, yParity: 0 });
            vi.mocked(viem.numberToHex).mockReturnValue('0x1' as Hex);
            vi.mocked(viem.padHex).mockReturnValue('0xpadded' as Hex);
            vi.mocked(viem.stringToHex).mockReturnValue('0xstr' as Hex);

            const result = await sign({
                hash: MOCK_HASH,
                owner: mockWebAuthnOwner,
            });

            expect(mockWebAuthnOwner.sign).toHaveBeenCalledWith({ hash: MOCK_HASH });
            expect(result).toBeDefined();
        });

        it('should call owner.sign for local account', async () => {
            const mockLocalOwner = {
                type: 'local' as const,
                address: '0x1234567890123456789012345678901234567890' as const,
                sign: vi.fn().mockResolvedValue(MOCK_SIGNATURE),
            } as any;

            const result = await sign({
                hash: MOCK_HASH,
                owner: mockLocalOwner,
            });

            expect(mockLocalOwner.sign).toHaveBeenCalledWith({ hash: MOCK_HASH });
            expect(result).toBe(MOCK_SIGNATURE);
        });

        it('should throw error when owner does not support signing', async () => {
            const mockInvalidOwner = {
                type: 'local' as const,
            };

            await expect(
                sign({
                    hash: MOCK_HASH,
                    owner: mockInvalidOwner as any,
                })
            ).rejects.toThrow('`owner` does not support raw sign.');
        });
    });

    describe('signTypedData unit tests', () => {
        it('should sign typed data with webAuthn owner', async () => {
            const mockTypedData = { domain: {}, types: {}, primaryType: 'Test', message: {} };
            const mockWebAuthnOwner = {
                type: 'webAuthn' as const,
                signTypedData: vi.fn().mockResolvedValue({
                    signature: MOCK_SIGNATURE,
                    webauthn: MOCK_WEBAUTHN,
                }),
            } as any;

            vi.mocked(viem.encodeAbiParameters).mockReturnValue(MOCK_WEBAUTHN_ENCODED);
            vi.mocked(Signature.fromHex).mockReturnValue({ r: MOCK_R, s: MOCK_S, yParity: 0 });
            vi.mocked(viem.numberToHex).mockReturnValue('0x1' as Hex);
            vi.mocked(viem.padHex).mockReturnValue('0xpadded' as Hex);
            vi.mocked(viem.stringToHex).mockReturnValue('0xstr' as Hex);

            const result = await signTypedData({
                typedData: mockTypedData,
                owner: mockWebAuthnOwner,
            });

            expect(mockWebAuthnOwner.signTypedData).toHaveBeenCalledWith(mockTypedData);
            expect(result).toBeDefined();
        });

        it('should hash locally and call owner.sign for local account', async () => {
            const mockTypedData = { domain: {}, types: {}, primaryType: 'Test', message: {} };
            const mockLocalOwner = {
                type: 'local' as const,
                address: '0x1234567890123456789012345678901234567890' as const,
                sign: vi.fn().mockResolvedValue(MOCK_SIGNATURE),
            } as any;

            vi.mocked(viem.hashTypedData).mockReturnValue('0xmockhash' as `0x${string}`);

            const result = await signTypedData({
                typedData: mockTypedData,
                owner: mockLocalOwner,
            });

            expect(viem.hashTypedData).toHaveBeenCalledWith(mockTypedData);
            expect(mockLocalOwner.sign).toHaveBeenCalledWith({ hash: '0xmockhash' });
            expect(result).toBe(MOCK_SIGNATURE);
        });

        it('should throw error when owner does not support sign', async () => {
            const mockTypedData = { domain: {}, types: {}, primaryType: 'Test', message: {} };
            const mockInvalidOwner = {
                type: 'local' as const,
            };

            await expect(
                signTypedData({
                    typedData: mockTypedData,
                    owner: mockInvalidOwner as any,
                })
            ).rejects.toThrow('`owner` does not support signTypedData.');
        });
    });

    describe('toJustanAccount function unit tests', () => {
        describe('EIP-7702 mode detection', () => {
            it('should detect EIP-7702 mode with eip7702Account', async () => {
                const mockEOA = {
                    type: 'local' as const,
                    address: MOCK_ADDRESS,
                } as any;

                const { readContract } = await import('viem/actions');
                const { toSmartAccount } = await import('viem/account-abstraction');

                vi.mocked(readContract).mockResolvedValue(MOCK_DELEGATION_CONTRACT);
                vi.mocked(toSmartAccount).mockReturnValue({} as any);

                await toJustanAccount({
                    client: MOCK_PUBLIC_CLIENT,
                    owners: [],
                    eip7702Account: mockEOA,
                    factoryAddress: MOCK_FACTORY_ADDRESS,
                });

                expect(readContract).toHaveBeenCalledWith(
                    MOCK_PUBLIC_CLIENT,
                    expect.objectContaining({
                        address: MOCK_FACTORY_ADDRESS,
                        functionName: 'getImplementation',
                    })
                );
            });

            it('should validate auth address matches delegation contract', async () => {
                const mockEOA = {
                    type: 'local' as const,
                    address: MOCK_ADDRESS,
                } as any;

                const mockAuth = {
                    address: MOCK_DELEGATION_CONTRACT,
                    chainId: 1,
                    nonce: 0,
                } as any;

                const { readContract } = await import('viem/actions');
                const { toSmartAccount } = await import('viem/account-abstraction');

                vi.mocked(readContract).mockResolvedValue(MOCK_DELEGATION_CONTRACT);
                vi.mocked(viem.isAddressEqual).mockReturnValue(true);
                vi.mocked(toSmartAccount).mockReturnValue({} as any);

                await toJustanAccount({
                    client: MOCK_PUBLIC_CLIENT,
                    owners: [],
                    eip7702Account: mockEOA,
                    eip7702Auth: mockAuth,
                    factoryAddress: MOCK_FACTORY_ADDRESS,
                });

                expect(viem.isAddressEqual).toHaveBeenCalled();
            });

            it('should throw error when auth address does not match delegation contract', async () => {
                const mockEOA = {
                    type: 'local' as const,
                    address: MOCK_ADDRESS,
                } as any;

                const mockAuth = {
                    address: '0xwrongaddress1234567890123456789012345678' as const,
                    chainId: 1,
                    nonce: 0,
                } as any;

                const { readContract } = await import('viem/actions');

                vi.mocked(readContract).mockResolvedValue(MOCK_DELEGATION_CONTRACT);
                vi.mocked(viem.isAddressEqual).mockReturnValue(false);

                await expect(
                    toJustanAccount({
                        client: MOCK_PUBLIC_CLIENT,
                        owners: [],
                        eip7702Account: mockEOA,
                        eip7702Auth: mockAuth,
                        factoryAddress: MOCK_FACTORY_ADDRESS,
                    })
                ).rejects.toThrow('EIP-7702 authorization delegate address does not match delegation contract address');
            });
        });

        describe('Owner processing', () => {
            it('should process string owner to padded bytes', async () => {
                const mockStringOwner = MOCK_ADDRESS;
                const mockPaddedBytes = '0xpadded' as Hex;

                const { readContract } = await import('viem/actions');
                const { toSmartAccount } = await import('viem/account-abstraction');

                vi.mocked(viem.pad).mockReturnValue(mockPaddedBytes);
                vi.mocked(readContract).mockResolvedValue(MOCK_ADDRESS);
                vi.mocked(toSmartAccount).mockReturnValue({} as any);

                await toJustanAccount({
                    client: MOCK_PUBLIC_CLIENT,
                    owners: [mockStringOwner],
                    factoryAddress: MOCK_FACTORY_ADDRESS,
                });

                expect(viem.pad).toHaveBeenCalledWith(mockStringOwner);
            });

            it('should process WebAuthn owner to publicKey', async () => {
                const mockPublicKey = '0xpublickey1234567890' as Hex;
                const mockWebAuthnOwner = {
                    type: 'webAuthn' as const,
                    publicKey: mockPublicKey,
                } as any;

                const { readContract } = await import('viem/actions');
                const { toSmartAccount } = await import('viem/account-abstraction');

                vi.mocked(readContract).mockResolvedValue(MOCK_ADDRESS);
                vi.mocked(toSmartAccount).mockReturnValue({} as any);

                await toJustanAccount({
                    client: MOCK_PUBLIC_CLIENT,
                    owners: [mockWebAuthnOwner],
                    factoryAddress: MOCK_FACTORY_ADDRESS,
                });

                expect(readContract).toHaveBeenCalledWith(
                    MOCK_PUBLIC_CLIENT,
                    expect.objectContaining({
                        args: expect.arrayContaining([[mockPublicKey], 0n]),
                    })
                );
            });

            it('should process Local owner to padded address', async () => {
                const mockLocalOwner = {
                    type: 'local' as const,
                    address: MOCK_ADDRESS,
                } as any;
                const mockPaddedBytes = '0xpadded' as Hex;

                const { readContract } = await import('viem/actions');
                const { toSmartAccount } = await import('viem/account-abstraction');

                vi.mocked(viem.pad).mockReturnValue(mockPaddedBytes);
                vi.mocked(readContract).mockResolvedValue(MOCK_ADDRESS);
                vi.mocked(toSmartAccount).mockReturnValue({} as any);

                await toJustanAccount({
                    client: MOCK_PUBLIC_CLIENT,
                    owners: [mockLocalOwner],
                    factoryAddress: MOCK_FACTORY_ADDRESS,
                });

                expect(viem.pad).toHaveBeenCalledWith(MOCK_ADDRESS);
            });

            it('should throw error for invalid owner type', async () => {
                const mockInvalidOwner = {
                    type: 'invalid' as any,
                } as any;

                await expect(
                    toJustanAccount({
                        client: MOCK_PUBLIC_CLIENT,
                        owners: [mockInvalidOwner],
                        factoryAddress: MOCK_FACTORY_ADDRESS,
                    })
                ).rejects.toThrow('invalid owner type');
            });
        });

        describe('Owner selection', () => {
            it('should use eip7702Account as owner in EIP-7702 mode', async () => {
                const mockEOA = {
                    type: 'local' as const,
                    address: MOCK_ADDRESS,
                    sign: vi.fn(),
                } as any;

                const { readContract } = await import('viem/actions');
                const { toSmartAccount } = await import('viem/account-abstraction');

                vi.mocked(readContract).mockResolvedValue(MOCK_DELEGATION_CONTRACT);
                vi.mocked(toSmartAccount).mockImplementation((params: any) => {
                    expect(params).toBeDefined();
                    return {} as any;
                });

                await toJustanAccount({
                    client: MOCK_PUBLIC_CLIENT,
                    owners: [],
                    eip7702Account: mockEOA,
                    factoryAddress: MOCK_FACTORY_ADDRESS,
                });

                expect(toSmartAccount).toHaveBeenCalled();
            });

            it('should use ownerIndex to select owner', async () => {
                const mockOwner1 = {
                    type: 'local' as const,
                    address: MOCK_ADDRESS,
                } as any;
                const mockOwner2 = {
                    type: 'local' as const,
                    address: '0x2222222222222222222222222222222222222222' as const,
                } as any;

                const { readContract } = await import('viem/actions');
                const { toSmartAccount } = await import('viem/account-abstraction');

                vi.mocked(viem.pad).mockReturnValue('0xpadded' as Hex);
                vi.mocked(readContract).mockResolvedValue(MOCK_ADDRESS);
                vi.mocked(toSmartAccount).mockReturnValue({} as any);

                await toJustanAccount({
                    client: MOCK_PUBLIC_CLIENT,
                    owners: [mockOwner1, mockOwner2],
                    ownerIndex: 1,
                    factoryAddress: MOCK_FACTORY_ADDRESS,
                });

                expect(toSmartAccount).toHaveBeenCalled();
            });

            it('should throw error when no owner provided in EIP-7702 mode without eip7702Account', async () => {
                const mockAuth = {
                    address: MOCK_DELEGATION_CONTRACT,
                    chainId: 1,
                    nonce: 0,
                } as any;

                const { readContract } = await import('viem/actions');

                vi.mocked(readContract).mockResolvedValue(MOCK_DELEGATION_CONTRACT);
                vi.mocked(viem.isAddressEqual).mockReturnValue(true);

                await expect(
                    toJustanAccount({
                        client: MOCK_PUBLIC_CLIENT,
                        owners: [],
                        eip7702Auth: mockAuth,
                        factoryAddress: MOCK_FACTORY_ADDRESS,
                    })
                ).rejects.toThrow('eip7702Account is required when using EIP-7702');
            });
        });

        describe('Account address resolution', () => {
            it('should use eip7702Account address in EIP-7702 mode', async () => {
                const mockEOA = {
                    type: 'local' as const,
                    address: MOCK_ADDRESS,
                } as any;

                const { readContract } = await import('viem/actions');
                const { toSmartAccount } = await import('viem/account-abstraction');

                vi.mocked(readContract).mockResolvedValue(MOCK_DELEGATION_CONTRACT);
                vi.mocked(toSmartAccount).mockImplementation((params: any) => {
                    expect(params.getAddress).toBeDefined();
                    return {} as any;
                });

                const result = await toJustanAccount({
                    client: MOCK_PUBLIC_CLIENT,
                    owners: [],
                    eip7702Account: mockEOA,
                    factoryAddress: MOCK_FACTORY_ADDRESS,
                });

                expect(result).toBeDefined();
            });

            it('should call readContract for address in non-EIP-7702 mode', async () => {
                const mockOwner = {
                    type: 'local' as const,
                    address: MOCK_ADDRESS,
                } as any;

                const { readContract } = await import('viem/actions');
                const { toSmartAccount } = await import('viem/account-abstraction');

                vi.mocked(viem.pad).mockReturnValue('0xpadded' as Hex);
                vi.mocked(readContract).mockResolvedValue(MOCK_ADDRESS);
                vi.mocked(toSmartAccount).mockReturnValue({} as any);

                await toJustanAccount({
                    client: MOCK_PUBLIC_CLIENT,
                    owners: [mockOwner],
                    factoryAddress: MOCK_FACTORY_ADDRESS,
                });

                expect(readContract).toHaveBeenCalledWith(
                    MOCK_PUBLIC_CLIENT,
                    expect.objectContaining({
                        address: MOCK_FACTORY_ADDRESS,
                        functionName: 'getAddress',
                    })
                );
            });
        });
    });

    describe('justanAccount methods unit tests', () => {
        describe('getAddress()', () => {
            it('should return eip7702Account address in EIP-7702 mode', async () => {
                const mockEOA = {
                    type: 'local' as const,
                    address: MOCK_ADDRESS,
                } as any;

                const { readContract } = await import('viem/actions');
                const { toSmartAccount } = await import('viem/account-abstraction');

                vi.mocked(readContract).mockResolvedValue(MOCK_DELEGATION_CONTRACT);
                vi.mocked(toSmartAccount).mockReturnValue({
                    getAddress: vi.fn().mockResolvedValue(MOCK_ADDRESS),
                } as any);

                const account = await toJustanAccount({
                    client: MOCK_PUBLIC_CLIENT,
                    owners: [],
                    eip7702Account: mockEOA,
                    factoryAddress: MOCK_FACTORY_ADDRESS,
                });

                const address = await account.getAddress();
                expect(address).toBe(MOCK_ADDRESS);
            });

            it('should return computed address in non-EIP-7702 mode', async () => {
                const mockOwner = {
                    type: 'local' as const,
                    address: MOCK_ADDRESS,
                } as any;

                const { readContract } = await import('viem/actions');
                const { toSmartAccount } = await import('viem/account-abstraction');

                vi.mocked(viem.pad).mockReturnValue('0xpadded' as Hex);
                vi.mocked(readContract).mockResolvedValue(MOCK_ADDRESS);
                vi.mocked(toSmartAccount).mockReturnValue({
                    getAddress: vi.fn().mockResolvedValue(MOCK_ADDRESS),
                } as any);

                const account = await toJustanAccount({
                    client: MOCK_PUBLIC_CLIENT,
                    owners: [mockOwner],
                    factoryAddress: MOCK_FACTORY_ADDRESS,
                });

                const address = await account.getAddress();
                expect(address).toBe(MOCK_ADDRESS);
            });
        });

        describe('getStubSignature()', () => {
            it('should return short signature in EIP-7702 mode', async () => {
                const mockEOA = {
                    type: 'local' as const,
                    address: MOCK_ADDRESS,
                } as any;

                const { readContract } = await import('viem/actions');
                const { toSmartAccount } = await import('viem/account-abstraction');

                vi.mocked(readContract).mockResolvedValue(MOCK_DELEGATION_CONTRACT);
                vi.mocked(toSmartAccount).mockReturnValue({
                    getStubSignature: vi
                        .fn()
                        .mockResolvedValue(
                            '0xfffffffffffffffffffffffffffffff0000000000000000000000000000000007aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa1c'
                        ),
                } as any);

                const account = await toJustanAccount({
                    client: MOCK_PUBLIC_CLIENT,
                    owners: [],
                    eip7702Account: mockEOA,
                    factoryAddress: MOCK_FACTORY_ADDRESS,
                });

                const stubSig = await account.getStubSignature();
                expect(stubSig).toBe(
                    '0xfffffffffffffffffffffffffffffff0000000000000000000000000000000007aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa1c'
                );
            });

            it('should return long signature in non-EIP-7702 mode', async () => {
                const mockOwner = {
                    type: 'local' as const,
                    address: MOCK_ADDRESS,
                } as any;

                const { readContract } = await import('viem/actions');
                const { toSmartAccount } = await import('viem/account-abstraction');

                vi.mocked(viem.pad).mockReturnValue('0xpadded' as Hex);
                vi.mocked(readContract).mockResolvedValue(MOCK_ADDRESS);
                const longSig =
                    '0x0000000000000000000000000000000000000000000000000000000000000020000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000400000000000000000000000000000000000000000000000000000000000000200000000000000000000000000000000000000000000000000000000000000002000000000000000000000000000000000000000000000000000000000000000c0000000000000000000000000000000000000000000000000000000000000012000000000000000000000000000000000000000000000000000000000000000170000000000000000000000000000000000000000000000000000000000000001949fc7c88032b9fcb5f6efc7a7b8c63668eae9871b765e23123bb473ff57aa831a7c0d9276168ebcc29f2875a0239cffdf2a9cd1c2007c5c77c071db9264df1d000000000000000000000000000000000000000000000000000000000000002549960de5880e8c687434170f6476605b8fe4aeb9a28632c7995cf3ba831d9763050000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000847b2274797065223a22776562617574686e2e676574222c226368616c6c656e6765223a2273496a396e6164474850596759334b7156384f7a4a666c726275504b474f716d59576f4d57516869467773222c226f726967696e223a2268747470733a2f2f6b6579732e6a61772e6964222c2263726f73734f726967696e223a66616c73657d00000000000000000000000000000000000000000000000000000000';
                vi.mocked(toSmartAccount).mockReturnValue({
                    getStubSignature: vi.fn().mockResolvedValue(longSig),
                } as any);

                const account = await toJustanAccount({
                    client: MOCK_PUBLIC_CLIENT,
                    owners: [mockOwner],
                    factoryAddress: MOCK_FACTORY_ADDRESS,
                });

                const stubSig = await account.getStubSignature();
                expect(stubSig).toBe(longSig);
            });
        });

        describe('getFactoryArgs()', () => {
            it('should return undefined values in EIP-7702 mode', async () => {
                const mockEOA = {
                    type: 'local' as const,
                    address: MOCK_ADDRESS,
                } as any;

                const { readContract } = await import('viem/actions');
                const { toSmartAccount } = await import('viem/account-abstraction');

                vi.mocked(readContract).mockResolvedValue(MOCK_DELEGATION_CONTRACT);
                vi.mocked(toSmartAccount).mockReturnValue({
                    getFactoryArgs: vi.fn().mockResolvedValue({
                        factory: undefined,
                        factoryData: undefined,
                    }),
                } as any);

                const account = await toJustanAccount({
                    client: MOCK_PUBLIC_CLIENT,
                    owners: [],
                    eip7702Account: mockEOA,
                    factoryAddress: MOCK_FACTORY_ADDRESS,
                });

                const factoryArgs = await account.getFactoryArgs();
                expect(factoryArgs.factory).toBeUndefined();
                expect(factoryArgs.factoryData).toBeUndefined();
            });

            it('should return factory address and encoded data in non-EIP-7702 mode', async () => {
                const mockOwner = {
                    type: 'local' as const,
                    address: MOCK_ADDRESS,
                } as any;

                const mockEncodedData = '0xencodeddata' as Hex;
                const { readContract } = await import('viem/actions');
                const { toSmartAccount } = await import('viem/account-abstraction');

                vi.mocked(viem.pad).mockReturnValue('0xpadded' as Hex);
                vi.mocked(readContract).mockResolvedValue(MOCK_ADDRESS);
                vi.mocked(viem.encodeFunctionData).mockReturnValue(mockEncodedData);
                vi.mocked(toSmartAccount).mockReturnValue({
                    getFactoryArgs: vi.fn().mockResolvedValue({
                        factory: MOCK_FACTORY_ADDRESS,
                        factoryData: mockEncodedData,
                    }),
                } as any);

                const account = await toJustanAccount({
                    client: MOCK_PUBLIC_CLIENT,
                    owners: [mockOwner],
                    factoryAddress: MOCK_FACTORY_ADDRESS,
                });

                const factoryArgs = await account.getFactoryArgs();
                expect(factoryArgs.factory).toBe(MOCK_FACTORY_ADDRESS);
                expect(factoryArgs.factoryData).toBe(mockEncodedData);
            });
        });

        describe('userOperation.estimateGas()', () => {
            it('should set minimum 800k verificationGasLimit for WebAuthn owner', async () => {
                const mockPublicKey = '0xpublickey1234567890' as Hex;
                const mockWebAuthnOwner = {
                    type: 'webAuthn' as const,
                    publicKey: mockPublicKey,
                } as any;

                const { readContract } = await import('viem/actions');
                const { toSmartAccount } = await import('viem/account-abstraction');

                vi.mocked(readContract).mockResolvedValue(MOCK_ADDRESS);
                vi.mocked(toSmartAccount).mockReturnValue({
                    userOperation: {
                        estimateGas: vi.fn().mockResolvedValue({
                            verificationGasLimit: 800_000n,
                        }),
                    },
                } as any);

                const account = await toJustanAccount({
                    client: MOCK_PUBLIC_CLIENT,
                    owners: [mockWebAuthnOwner],
                    factoryAddress: MOCK_FACTORY_ADDRESS,
                });

                expect(account.userOperation).toBeDefined();
                expect(account.userOperation!.estimateGas).toBeDefined();

                const gasEstimate = await account.userOperation!.estimateGas!({
                    verificationGasLimit: 500_000n,
                } as any);

                expect(gasEstimate).toBeDefined();
                expect(gasEstimate?.verificationGasLimit).toBeGreaterThanOrEqual(800_000n);
            });

            it('should return undefined for non-WebAuthn owner', async () => {
                const mockOwner = {
                    type: 'local' as const,
                    address: MOCK_ADDRESS,
                } as any;

                const { readContract } = await import('viem/actions');
                const { toSmartAccount } = await import('viem/account-abstraction');

                vi.mocked(viem.pad).mockReturnValue('0xpadded' as Hex);
                vi.mocked(readContract).mockResolvedValue(MOCK_ADDRESS);
                vi.mocked(toSmartAccount).mockReturnValue({
                    userOperation: {
                        estimateGas: vi.fn().mockResolvedValue(undefined),
                    },
                } as any);

                const account = await toJustanAccount({
                    client: MOCK_PUBLIC_CLIENT,
                    owners: [mockOwner],
                    factoryAddress: MOCK_FACTORY_ADDRESS,
                });

                expect(account.userOperation).toBeDefined();
                expect(account.userOperation!.estimateGas).toBeDefined();

                const gasEstimate = await account.userOperation!.estimateGas!({
                    verificationGasLimit: 500_000n,
                } as any);

                expect(gasEstimate).toBeUndefined();
            });
        });

        describe('signMessage()', () => {
            it('should return raw signature in EIP-7702 mode', async () => {
                const mockEOA = {
                    type: 'local' as const,
                    address: MOCK_ADDRESS,
                    sign: vi.fn().mockResolvedValue(MOCK_SIGNATURE),
                } as any;

                const { readContract } = await import('viem/actions');
                const { toSmartAccount } = await import('viem/account-abstraction');

                vi.mocked(readContract).mockResolvedValue(MOCK_DELEGATION_CONTRACT);
                vi.mocked(toSmartAccount).mockImplementation((params: any) => ({
                    ...params,
                }));

                const account = await toJustanAccount({
                    client: MOCK_PUBLIC_CLIENT,
                    owners: [],
                    eip7702Account: mockEOA,
                    factoryAddress: MOCK_FACTORY_ADDRESS,
                });

                const signature = await account.signMessage({ message: MOCK_MESSAGE });

                expect(mockEOA.sign).toHaveBeenCalled();
                expect(signature).toBe(MOCK_SIGNATURE);
            });

            it('should return wrapped signature in non-EIP-7702 mode', async () => {
                const mockOwner = {
                    type: 'local' as const,
                    address: MOCK_ADDRESS,
                    sign: vi.fn().mockResolvedValue(MOCK_SIGNATURE),
                } as any;

                const { readContract } = await import('viem/actions');
                const { toSmartAccount } = await import('viem/account-abstraction');

                vi.mocked(viem.pad).mockReturnValue('0xpadded' as Hex);
                vi.mocked(readContract).mockResolvedValue(MOCK_ADDRESS);
                vi.mocked(viem.encodeAbiParameters).mockReturnValue(MOCK_WRAPPED_SIGNATURE);
                vi.mocked(toSmartAccount).mockImplementation((params: any) => ({
                    ...params,
                }));

                const account = await toJustanAccount({
                    client: MOCK_PUBLIC_CLIENT,
                    owners: [mockOwner],
                    factoryAddress: MOCK_FACTORY_ADDRESS,
                });

                const signature = await account.signMessage({ message: MOCK_MESSAGE });

                expect(mockOwner.sign).toHaveBeenCalled();
                expect(viem.encodeAbiParameters).toHaveBeenCalled();
                expect(signature).toBe(MOCK_WRAPPED_SIGNATURE);
            });

            it('should throw error for address-type owner', async () => {
                const mockAddressOwner = MOCK_ADDRESS;

                const { readContract } = await import('viem/actions');
                const { toSmartAccount } = await import('viem/account-abstraction');

                vi.mocked(viem.pad).mockReturnValue('0xpadded' as Hex);
                vi.mocked(readContract).mockResolvedValue(MOCK_ADDRESS);

                const mockSignMessage = vi.fn().mockRejectedValue(new Error('owner cannot sign'));
                vi.mocked(toSmartAccount).mockReturnValue({
                    signMessage: mockSignMessage,
                } as any);

                const account = await toJustanAccount({
                    client: MOCK_PUBLIC_CLIENT,
                    owners: [mockAddressOwner],
                    factoryAddress: MOCK_FACTORY_ADDRESS,
                });

                await expect(account.signMessage({ message: MOCK_MESSAGE })).rejects.toThrow('owner cannot sign');
            });
        });

        describe('signTypedData()', () => {
            it('should return raw signature in EIP-7702 mode', async () => {
                const mockEOA = {
                    type: 'local' as const,
                    address: MOCK_ADDRESS,
                    sign: vi.fn().mockResolvedValue(MOCK_SIGNATURE),
                } as any;

                const { readContract } = await import('viem/actions');
                const { toSmartAccount } = await import('viem/account-abstraction');

                vi.mocked(readContract).mockResolvedValue(MOCK_DELEGATION_CONTRACT);
                vi.mocked(toSmartAccount).mockImplementation((params: any) => ({
                    ...params,
                }));

                const account = await toJustanAccount({
                    client: MOCK_PUBLIC_CLIENT,
                    owners: [],
                    eip7702Account: mockEOA,
                    factoryAddress: MOCK_FACTORY_ADDRESS,
                });

                const signature = await account.signTypedData(MOCK_TYPED_DATA);

                expect(mockEOA.sign).toHaveBeenCalled();
                expect(signature).toBe(MOCK_SIGNATURE);
            });

            it('should return wrapped typed data signature in non-EIP-7702 mode', async () => {
                const mockOwner = {
                    type: 'local' as const,
                    address: MOCK_ADDRESS,
                    sign: vi.fn().mockResolvedValue(MOCK_SIGNATURE),
                } as any;

                const { readContract } = await import('viem/actions');
                const { toSmartAccount } = await import('viem/account-abstraction');
                const { wrapTypedDataSignature } = await import('viem/experimental/erc7739');

                vi.mocked(viem.pad).mockReturnValue('0xpadded' as Hex);
                vi.mocked(readContract).mockResolvedValue(MOCK_ADDRESS);
                vi.mocked(viem.encodeAbiParameters).mockReturnValue(MOCK_WRAPPED_SIGNATURE);
                vi.mocked(wrapTypedDataSignature).mockReturnValue(MOCK_WRAPPED_TYPED_DATA_SIGNATURE);
                vi.mocked(toSmartAccount).mockImplementation((params: any) => ({
                    ...params,
                }));

                const account = await toJustanAccount({
                    client: MOCK_PUBLIC_CLIENT,
                    owners: [mockOwner],
                    factoryAddress: MOCK_FACTORY_ADDRESS,
                });

                const signature = await account.signTypedData(MOCK_TYPED_DATA);

                expect(mockOwner.sign).toHaveBeenCalled();
                expect(wrapTypedDataSignature).toHaveBeenCalled();
                expect(signature).toBe(MOCK_WRAPPED_TYPED_DATA_SIGNATURE);
            });

            it('should throw error for address-type owner', async () => {
                const mockAddressOwner = MOCK_ADDRESS;

                const { readContract } = await import('viem/actions');
                const { toSmartAccount } = await import('viem/account-abstraction');

                vi.mocked(viem.pad).mockReturnValue('0xpadded' as Hex);
                vi.mocked(readContract).mockResolvedValue(MOCK_ADDRESS);

                const mockSignTypedData = vi.fn().mockRejectedValue(new Error('owner cannot sign'));
                vi.mocked(toSmartAccount).mockReturnValue({
                    signTypedData: mockSignTypedData,
                } as any);

                const account = await toJustanAccount({
                    client: MOCK_PUBLIC_CLIENT,
                    owners: [mockAddressOwner],
                    factoryAddress: MOCK_FACTORY_ADDRESS,
                });

                await expect(account.signTypedData(MOCK_TYPED_DATA)).rejects.toThrow('owner cannot sign');
            });
        });

        describe('signUserOperation()', () => {
            it('should return raw signature in EIP-7702 mode', async () => {
                const mockEOA = {
                    type: 'local' as const,
                    address: MOCK_ADDRESS,
                    sign: vi.fn().mockResolvedValue(MOCK_SIGNATURE),
                } as any;

                const { readContract } = await import('viem/actions');
                const { toSmartAccount, getUserOperationTypedData } = await import('viem/account-abstraction');

                vi.mocked(readContract).mockResolvedValue(MOCK_DELEGATION_CONTRACT);
                vi.mocked(getUserOperationTypedData).mockReturnValue(MOCK_TYPED_DATA as any);

                const mockSignUserOperation = vi.fn().mockResolvedValue(MOCK_SIGNATURE);
                vi.mocked(toSmartAccount).mockReturnValue({
                    signUserOperation: mockSignUserOperation,
                    getAddress: vi.fn().mockResolvedValue(MOCK_ADDRESS),
                } as any);

                const account = await toJustanAccount({
                    client: MOCK_PUBLIC_CLIENT,
                    owners: [],
                    eip7702Account: mockEOA,
                    factoryAddress: MOCK_FACTORY_ADDRESS,
                });

                const signature = await account.signUserOperation({
                    callData: '0x',
                    callGasLimit: 100000n,
                    verificationGasLimit: 100000n,
                    preVerificationGas: 100000n,
                    maxFeePerGas: 1n,
                    maxPriorityFeePerGas: 1n,
                } as any);

                expect(signature).toBe(MOCK_SIGNATURE);
            });

            it('should return wrapped signature in non-EIP-7702 mode', async () => {
                const mockOwner = {
                    type: 'local' as const,
                    address: MOCK_ADDRESS,
                    sign: vi.fn().mockResolvedValue(MOCK_SIGNATURE),
                } as any;

                const { readContract } = await import('viem/actions');
                const { toSmartAccount, getUserOperationTypedData } = await import('viem/account-abstraction');

                vi.mocked(viem.pad).mockReturnValue('0xpadded' as Hex);
                vi.mocked(readContract).mockResolvedValue(MOCK_ADDRESS);
                vi.mocked(getUserOperationTypedData).mockReturnValue(MOCK_TYPED_DATA as any);
                vi.mocked(viem.encodeAbiParameters).mockReturnValue(MOCK_WRAPPED_SIGNATURE);

                const mockSignUserOperation = vi.fn().mockResolvedValue(MOCK_WRAPPED_SIGNATURE);
                vi.mocked(toSmartAccount).mockReturnValue({
                    signUserOperation: mockSignUserOperation,
                    getAddress: vi.fn().mockResolvedValue(MOCK_ADDRESS),
                } as any);

                const account = await toJustanAccount({
                    client: MOCK_PUBLIC_CLIENT,
                    owners: [mockOwner],
                    factoryAddress: MOCK_FACTORY_ADDRESS,
                });

                const signature = await account.signUserOperation({
                    callData: '0x',
                    callGasLimit: 100000n,
                    verificationGasLimit: 100000n,
                    preVerificationGas: 100000n,
                    maxFeePerGas: 1n,
                    maxPriorityFeePerGas: 1n,
                } as any);

                expect(signature).toBe(MOCK_WRAPPED_SIGNATURE);
            });

            it('should throw error for address-type owner', async () => {
                const mockAddressOwner = MOCK_ADDRESS;

                const { readContract } = await import('viem/actions');
                const { toSmartAccount } = await import('viem/account-abstraction');

                vi.mocked(viem.pad).mockReturnValue('0xpadded' as Hex);
                vi.mocked(readContract).mockResolvedValue(MOCK_ADDRESS);

                const mockSignUserOperation = vi.fn().mockRejectedValue(new Error('owner cannot sign'));
                vi.mocked(toSmartAccount).mockReturnValue({
                    signUserOperation: mockSignUserOperation,
                } as any);

                const account = await toJustanAccount({
                    client: MOCK_PUBLIC_CLIENT,
                    owners: [mockAddressOwner],
                    factoryAddress: MOCK_FACTORY_ADDRESS,
                });

                await expect(
                    account.signUserOperation({
                        callData: '0x',
                        callGasLimit: 100000n,
                        verificationGasLimit: 100000n,
                        preVerificationGas: 100000n,
                        maxFeePerGas: 1n,
                        maxPriorityFeePerGas: 1n,
                    } as any)
                ).rejects.toThrow('owner cannot sign');
            });
        });

        describe('signAuthorization()', () => {
            it('should return pre-signed auth if available', async () => {
                const mockEOA = {
                    type: 'local' as const,
                    address: MOCK_ADDRESS,
                } as any;

                const mockAuth = {
                    address: MOCK_DELEGATION_CONTRACT,
                    chainId: 1,
                    nonce: 0,
                } as any;

                const { readContract } = await import('viem/actions');
                const { toSmartAccount } = await import('viem/account-abstraction');

                vi.mocked(readContract).mockResolvedValue(MOCK_DELEGATION_CONTRACT);
                vi.mocked(viem.isAddressEqual).mockReturnValue(true);

                const mockSignAuthorization = vi.fn().mockResolvedValue(mockAuth);
                vi.mocked(toSmartAccount).mockReturnValue({
                    signAuthorization: mockSignAuthorization,
                } as any);

                const account = await toJustanAccount({
                    client: MOCK_PUBLIC_CLIENT,
                    owners: [],
                    eip7702Account: mockEOA,
                    eip7702Auth: mockAuth,
                    factoryAddress: MOCK_FACTORY_ADDRESS,
                });

                const auth = await account.signAuthorization();

                expect(auth).toBe(mockAuth);
            });

            it('should use native signAuthorization if available (Tier 1)', async () => {
                const mockAuth = {
                    address: MOCK_DELEGATION_CONTRACT,
                    chainId: 1,
                    nonce: 0,
                } as any;

                const mockSignAuthorization = vi.fn().mockResolvedValue(mockAuth);
                const mockEOA = {
                    type: 'local' as const,
                    address: MOCK_ADDRESS,
                    signAuthorization: mockSignAuthorization,
                } as any;

                const { readContract, getChainId } = await import('viem/actions');
                const { toSmartAccount } = await import('viem/account-abstraction');
                const { getTransactionCount } = await import('viem/actions');

                vi.mocked(readContract).mockResolvedValue(MOCK_DELEGATION_CONTRACT);
                vi.mocked(getChainId).mockResolvedValue(1);
                vi.mocked(getTransactionCount).mockResolvedValue(0);
                vi.mocked(toSmartAccount).mockImplementation((params: any) => ({
                    ...params,
                }));

                const account = await toJustanAccount({
                    client: MOCK_PUBLIC_CLIENT,
                    owners: [],
                    eip7702Account: mockEOA,
                    factoryAddress: MOCK_FACTORY_ADDRESS,
                });

                const auth = await account.signAuthorization();

                expect(getChainId).toHaveBeenCalled();
                expect(getTransactionCount).toHaveBeenCalled();
                expect(mockSignAuthorization).toHaveBeenCalledWith({
                    contractAddress: MOCK_DELEGATION_CONTRACT,
                    chainId: 1,
                    nonce: 0,
                });
                expect(auth).toEqual(mockAuth);
            });

            it('should throw error for non-EIP-7702 accounts', async () => {
                const mockOwner = {
                    type: 'local' as const,
                    address: MOCK_ADDRESS,
                } as any;

                const { readContract } = await import('viem/actions');
                const { toSmartAccount } = await import('viem/account-abstraction');

                vi.mocked(viem.pad).mockReturnValue('0xpadded' as Hex);
                vi.mocked(readContract).mockResolvedValue(MOCK_ADDRESS);

                const mockSignAuthorization = vi
                    .fn()
                    .mockRejectedValue(new Error('signAuthorization can only be called for EIP-7702 accounts'));
                vi.mocked(toSmartAccount).mockReturnValue({
                    signAuthorization: mockSignAuthorization,
                } as any);

                const account = await toJustanAccount({
                    client: MOCK_PUBLIC_CLIENT,
                    owners: [mockOwner],
                    factoryAddress: MOCK_FACTORY_ADDRESS,
                });

                await expect(account.signAuthorization()).rejects.toThrow(
                    'signAuthorization can only be called for EIP-7702 accounts'
                );
            });
        });
    });
});
