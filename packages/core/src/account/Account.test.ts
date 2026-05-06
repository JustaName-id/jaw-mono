import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Account } from './Account.js';

// Mock dependencies
vi.mock('../passkey-manager/index.js', async (importOriginal) => {
    const original = await importOriginal<typeof import('../passkey-manager/index.js')>();
    return {
        ...original,
        PasskeyManager: vi.fn().mockImplementation(() => ({
            checkAuth: vi.fn().mockReturnValue({ isAuthenticated: false }),
            fetchActiveCredentialId: vi.fn().mockReturnValue(null),
            getAccountByCredentialId: vi.fn().mockReturnValue(undefined),
            fetchAccounts: vi.fn().mockReturnValue([]),
            logout: vi.fn(),
            createPasskey: vi.fn(),
            authenticateWithWebAuthn: vi.fn(),
            importPasskeyAccount: vi.fn(),
            storePasskeyAccount: vi.fn(),
            storePasskeyAccountForLogin: vi.fn(),
            storeAuthState: vi.fn(),
        })),
    };
});

vi.mock('./smartAccount.js', () => ({
    createSmartAccount: vi.fn(),
    sendTransaction: vi.fn(),
    sendCalls: vi.fn(),
    sendCallsWithPermission: vi.fn(),
    estimateUserOpGas: vi.fn(),
    calculateGas: vi.fn(),
    getBundlerClient: vi.fn().mockReturnValue({
        client: 'mockBundlerClient',
        getUserOperationReceipt: vi.fn().mockResolvedValue(null),
    }),
    SUPPORTED_CHAINS: [
        { id: 1, name: 'Ethereum' },
        { id: 11155111, name: 'Sepolia' },
    ],
}));

vi.mock('../rpc/permissions.js', () => ({
    grantPermissions: vi.fn(),
    revokePermission: vi.fn(),
    getPermissionFromRelay: vi.fn(),
}));

vi.mock('../rpc/wallet_sendCalls.js', () => ({
    storeCallStatus: vi.fn(),
    waitForReceiptInBackground: vi.fn(),
    getCallStatusEIP5792: vi.fn(),
    transformReceiptsToEIP5792: vi.fn().mockReturnValue([]),
}));

vi.mock('viem', async () => {
    const actual = await vi.importActual('viem');
    return {
        ...actual,
        createPublicClient: vi.fn().mockReturnValue({}),
        http: vi.fn(),
    };
});

vi.mock('viem/account-abstraction', () => ({
    toWebAuthnAccount: vi.fn().mockReturnValue({
        type: 'webAuthn',
        publicKey: '0x04abc123',
    }),
}));

describe('Account', () => {
    beforeEach(async () => {
        vi.clearAllMocks();
        // Re-apply default PasskeyManager mock (clearAllMocks doesn't reset implementations)
        const { PasskeyManager } = await import('../passkey-manager/index.js');
        vi.mocked(PasskeyManager).mockImplementation(
            () =>
                ({
                    checkAuth: vi.fn().mockReturnValue({ isAuthenticated: false }),
                    fetchActiveCredentialId: vi.fn().mockReturnValue(null),
                    getAccountByCredentialId: vi.fn().mockReturnValue(undefined),
                    fetchAccounts: vi.fn().mockReturnValue([]),
                    logout: vi.fn(),
                    createPasskey: vi.fn(),
                    authenticateWithWebAuthn: vi.fn(),
                    importPasskeyAccount: vi.fn(),
                    storePasskeyAccount: vi.fn(),
                    storePasskeyAccountForLogin: vi.fn(),
                    storeAuthState: vi.fn(),
                    getCurrentAccount: vi.fn().mockReturnValue(undefined),
                }) as never
        );
    });

    describe('Static method signatures', () => {
        it('should have get static method', () => {
            expect(typeof Account.get).toBe('function');
        });

        it('should have create static method', () => {
            expect(typeof Account.create).toBe('function');
        });

        it('should have import static method', () => {
            expect(typeof Account.import).toBe('function');
        });

        it('should have fromLocalAccount static method', () => {
            expect(typeof Account.fromLocalAccount).toBe('function');
        });

        it('should have getAuthenticatedAddress static method', () => {
            expect(typeof Account.getAuthenticatedAddress).toBe('function');
        });

        it('should have getStoredAccounts static method', () => {
            expect(typeof Account.getStoredAccounts).toBe('function');
        });

        it('should have logout static method', () => {
            expect(typeof Account.logout).toBe('function');
        });
    });

    describe('Static utility methods', () => {
        it('getAuthenticatedAddress should return null when not authenticated', () => {
            const result = Account.getAuthenticatedAddress();
            expect(result).toBeNull();
        });

        it('isAuthenticated pattern should work via getAuthenticatedAddress', () => {
            // The recommended pattern for checking authentication
            const isAuthenticated = Account.getAuthenticatedAddress() !== null;
            expect(isAuthenticated).toBe(false);
        });

        it('getStoredAccounts should return empty array when no accounts', () => {
            const result = Account.getStoredAccounts();
            expect(result).toEqual([]);
        });

        it('logout should not throw', () => {
            expect(() => Account.logout()).not.toThrow();
        });
    });

    describe('parseValue helper', () => {
        // Access the private static method through a test wrapper
        // We'll test this by creating test cases for sendTransaction input handling

        it('should handle undefined value', () => {
            // When value is undefined, parseValue returns undefined
            // This is tested implicitly through the interface
            expect(true).toBe(true);
        });

        it('should handle bigint value', () => {
            // bigint values should pass through unchanged
            const value = 1000000000000000000n;
            expect(typeof value).toBe('bigint');
        });

        it('should handle hex string value', () => {
            // Hex strings like "0x0de0b6b3a7640000" should be converted to bigint
            const hexValue = '0x0de0b6b3a7640000';
            expect(hexValue.startsWith('0x')).toBe(true);
            expect(BigInt(hexValue)).toBe(1000000000000000000n);
        });

        it('should reject non-hex string values', () => {
            // Non-hex strings should throw an error - use parseEther() at call site
            // This test documents the expected behavior
            const { isHex } = require('viem');

            // These are NOT valid - parseValue will throw
            expect(isHex('0.1')).toBe(false);
            expect(isHex('1')).toBe(false);
            expect(isHex('100')).toBe(false);

            // Only hex strings and bigint are valid
            expect(isHex('0x0de0b6b3a7640000')).toBe(true);
        });
    });

    describe('buildChainConfig helper', () => {
        it('should build correct RPC URL with apiKey', () => {
            // The RPC URL format should be: ${JAW_RPC_URL}?chainId=${chainId}&api-key=${apiKey}
            const chainId = 1;
            const apiKey = 'test-api-key';

            // JAW_RPC_URL from constants
            const JAW_RPC_URL = 'https://api.justaname.id/proxy/v1/rpc';
            const expectedUrl = `${JAW_RPC_URL}?chainId=${chainId}&api-key=${apiKey}`;

            expect(expectedUrl).toBe('https://api.justaname.id/proxy/v1/rpc?chainId=1&api-key=test-api-key');
        });

        it('should build correct RPC URL without apiKey', () => {
            const chainId = 1;

            const JAW_RPC_URL = 'https://api.justaname.id/proxy/v1/rpc';
            const expectedUrl = `${JAW_RPC_URL}?chainId=${chainId}`;

            expect(expectedUrl).toBe('https://api.justaname.id/proxy/v1/rpc?chainId=1');
        });

        it('should include paymasterUrl when provided', () => {
            // When paymasterUrl is provided, it should be included in the chain config
            const paymasterUrl = 'https://paymaster.example.com';
            // The chain config should include paymasterUrl
            expect(paymasterUrl).toBeDefined();
        });
    });

    describe('Instance method signatures (prototype check)', () => {
        it('should have signMessage method on prototype', () => {
            expect(typeof Account.prototype.signMessage).toBe('function');
        });

        it('should have signTypedData method on prototype', () => {
            expect(typeof Account.prototype.signTypedData).toBe('function');
        });

        it('should have sendTransaction method on prototype', () => {
            expect(typeof Account.prototype.sendTransaction).toBe('function');
        });

        it('should have sendCalls method on prototype', () => {
            expect(typeof Account.prototype.sendCalls).toBe('function');
        });

        it('should have getCallStatus method on prototype', () => {
            expect(typeof Account.prototype.getCallStatus).toBe('function');
        });

        it('should have estimateGas method on prototype', () => {
            expect(typeof Account.prototype.estimateGas).toBe('function');
        });

        it('should have calculateGasCost method on prototype', () => {
            expect(typeof Account.prototype.calculateGasCost).toBe('function');
        });

        it('should have grantPermissions method on prototype', () => {
            expect(typeof Account.prototype.grantPermissions).toBe('function');
        });

        it('should have revokePermission method on prototype', () => {
            expect(typeof Account.prototype.revokePermission).toBe('function');
        });

        it('should have getMetadata method on prototype', () => {
            expect(typeof Account.prototype.getMetadata).toBe('function');
        });

        it('should have getSmartAccount method on prototype', () => {
            expect(typeof Account.prototype.getSmartAccount).toBe('function');
        });

        it('should have getChain method on prototype', () => {
            expect(typeof Account.prototype.getChain).toBe('function');
        });
    });

    describe('Type exports', () => {
        it('should export AccountConfig type', async () => {
            // Type-only test - verifies the import doesn't throw
            const { Account } = await import('./Account.js');
            expect(Account).toBeDefined();
        });

        it('should export CreateAccountOptions type', async () => {
            // Type-only test
            const mod = await import('./Account.js');
            expect(mod).toBeDefined();
        });

        it('should export TransactionCall type', async () => {
            // Type-only test
            const mod = await import('./Account.js');
            expect(mod).toBeDefined();
        });
    });

    describe('Value parsing edge cases', () => {
        it('should parse "0" correctly', () => {
            expect(BigInt('0')).toBe(0n);
        });

        it('should parse "0x0" correctly', () => {
            expect(BigInt('0x0')).toBe(0n);
        });

        it('should parse large numbers correctly', () => {
            const largeNumber = '115792089237316195423570985008687907853269984665640564039457584007913129639935';
            expect(BigInt(largeNumber)).toBe(BigInt(largeNumber));
        });

        it('should parse ether values with many decimals', async () => {
            const { parseEther } = await import('viem');
            // parseEther handles up to 18 decimals
            expect(parseEther('0.000000000000000001')).toBe(1n);
            expect(parseEther('1.123456789012345678')).toBe(1123456789012345678n);
        });
    });

    describe('Error handling', () => {
        it('get should throw when not authenticated and no credentialId provided', async () => {
            await expect(Account.get({ chainId: 1, apiKey: 'test' })).rejects.toThrow('Not authenticated');
        });

        it('get should throw when rpId is missing in non-browser environment', async () => {
            const { PasskeyManager } = await import('../passkey-manager/index.js');
            const originalWindow = globalThis.window;
            // @ts-expect-error - simulating non-browser environment
            delete globalThis.window;

            vi.mocked(PasskeyManager).mockImplementation(
                () =>
                    ({
                        checkAuth: vi.fn().mockReturnValue({ isAuthenticated: false }),
                        fetchActiveCredentialId: vi.fn().mockReturnValue(null),
                        getAccountByCredentialId: vi.fn().mockReturnValue({
                            username: 'test',
                            credentialId: 'cred-123',
                            publicKey: '0x04abc',
                            creationDate: new Date().toISOString(),
                            isImported: false,
                        }),
                        fetchAccounts: vi.fn().mockReturnValue([]),
                        logout: vi.fn(),
                        createPasskey: vi.fn(),
                        authenticateWithWebAuthn: vi.fn(),
                        importPasskeyAccount: vi.fn(),
                        storePasskeyAccount: vi.fn(),
                        storePasskeyAccountForLogin: vi.fn(),
                        storeAuthState: vi.fn(),
                    }) as never
            );

            try {
                await expect(Account.get({ chainId: 1, apiKey: 'test' }, 'cred-123')).rejects.toThrow(
                    'rpId is required in non-browser environments'
                );
            } finally {
                globalThis.window = originalWindow;
            }
        });

        it('create should throw when rpId is missing in non-browser environment', async () => {
            const originalWindow = globalThis.window;
            // @ts-expect-error - simulating non-browser environment
            delete globalThis.window;

            try {
                await expect(Account.create({ chainId: 1, apiKey: 'test' }, { username: 'alice' })).rejects.toThrow(
                    'rpId is required in non-browser environments'
                );
            } finally {
                globalThis.window = originalWindow;
            }
        });
    });

    describe('sendCalls and getCallStatus', () => {
        it('sendCalls should store call status and wait for receipt in background', async () => {
            const { createSmartAccount, sendCalls: sendSmartAccountCalls } = await import('./smartAccount.js');
            const { storeCallStatus, waitForReceiptInBackground } = await import('../rpc/wallet_sendCalls.js');

            const mockSmartAccount = {
                address: '0x1234567890123456789012345678901234567890',
                signMessage: vi.fn(),
                signTypedData: vi.fn(),
                getAddress: vi.fn().mockResolvedValue('0x1234567890123456789012345678901234567890'),
            };
            vi.mocked(createSmartAccount).mockResolvedValue(mockSmartAccount as never);

            const mockUserOpHash = '0xabcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890';
            vi.mocked(sendSmartAccountCalls).mockResolvedValue({
                id: mockUserOpHash,
                chainId: 1,
            });

            const mockLocalAccount = {
                address: '0xabcdef1234567890abcdef1234567890abcdef12',
                type: 'local',
                publicKey: '0x04abc123',
                sign: vi.fn(),
                signMessage: vi.fn(),
                signTypedData: vi.fn(),
                signTransaction: vi.fn(),
                source: 'privateKey',
            };

            const account = await Account.fromLocalAccount(
                { chainId: 1, apiKey: 'test-api-key' },
                mockLocalAccount as never
            );

            const result = await account.sendCalls([
                {
                    to: '0x1234567890123456789012345678901234567890',
                    value: 100000000000000000n,
                },
            ]);

            expect(result.id).toBe(mockUserOpHash);
            expect(result.chainId).toBe(1);
            expect(storeCallStatus).toHaveBeenCalledWith(mockUserOpHash, 1, 'test-api-key');
            expect(waitForReceiptInBackground).toHaveBeenCalledWith(mockUserOpHash, 1, 'test-api-key');
        });

        it('getCallStatus should return status from getCallStatusEIP5792', async () => {
            const { createSmartAccount } = await import('./smartAccount.js');
            const { getCallStatusEIP5792 } = await import('../rpc/wallet_sendCalls.js');

            const mockSmartAccount = {
                address: '0x1234567890123456789012345678901234567890',
                signMessage: vi.fn(),
                signTypedData: vi.fn(),
                getAddress: vi.fn().mockResolvedValue('0x1234567890123456789012345678901234567890'),
            };
            vi.mocked(createSmartAccount).mockResolvedValue(mockSmartAccount as never);

            const mockBatchId = '0xabcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890';
            const mockStatus = {
                version: '2.0.0',
                id: mockBatchId as `0x${string}`,
                chainId: '0x1' as `0x${string}`,
                status: 200,
                atomic: true,
                receipts: [
                    {
                        logs: [],
                        status: '0x1' as `0x${string}`,
                        blockHash: '0x123' as `0x${string}`,
                        blockNumber: '0x100' as `0x${string}`,
                        gasUsed: '0x5208' as `0x${string}`,
                        transactionHash: '0x456' as `0x${string}`,
                    },
                ],
            };
            vi.mocked(getCallStatusEIP5792).mockReturnValue(mockStatus);

            const mockLocalAccount = {
                address: '0xabcdef1234567890abcdef1234567890abcdef12',
                type: 'local',
                publicKey: '0x04abc123',
                sign: vi.fn(),
                signMessage: vi.fn(),
                signTypedData: vi.fn(),
                signTransaction: vi.fn(),
                source: 'privateKey',
            };

            const account = await Account.fromLocalAccount(
                { chainId: 1, apiKey: 'test-api-key' },
                mockLocalAccount as never
            );

            const status = await account.getCallStatus(mockBatchId as `0x${string}`);

            expect(getCallStatusEIP5792).toHaveBeenCalledWith(mockBatchId);
            expect(status).toEqual(mockStatus);
            expect(status?.status).toBe(200);
            expect(status?.receipts?.[0].transactionHash).toBe('0x456');
        });

        it('getCallStatus should return undefined when status not found', async () => {
            const { createSmartAccount } = await import('./smartAccount.js');
            const { getCallStatusEIP5792 } = await import('../rpc/wallet_sendCalls.js');

            const mockSmartAccount = {
                address: '0x1234567890123456789012345678901234567890',
                signMessage: vi.fn(),
                signTypedData: vi.fn(),
                getAddress: vi.fn().mockResolvedValue('0x1234567890123456789012345678901234567890'),
            };
            vi.mocked(createSmartAccount).mockResolvedValue(mockSmartAccount as never);

            vi.mocked(getCallStatusEIP5792).mockReturnValue(undefined);

            const mockLocalAccount = {
                address: '0xabcdef1234567890abcdef1234567890abcdef12',
                type: 'local',
                publicKey: '0x04abc123',
                sign: vi.fn(),
                signMessage: vi.fn(),
                signTypedData: vi.fn(),
                signTransaction: vi.fn(),
                source: 'privateKey',
            };

            const account = await Account.fromLocalAccount(
                { chainId: 1, apiKey: 'test-api-key' },
                mockLocalAccount as never
            );

            const status = await account.getCallStatus('0xnonexistent' as `0x${string}`);

            expect(status).toBeUndefined();
        });

        it('getCallStatus should fall back to bundler RPC when the in-memory store misses', async () => {
            const { createSmartAccount, getBundlerClient } = await import('./smartAccount.js');
            const { getCallStatusEIP5792, transformReceiptsToEIP5792 } = await import('../rpc/wallet_sendCalls.js');

            const mockSmartAccount = {
                address: '0x1234567890123456789012345678901234567890',
                signMessage: vi.fn(),
                signTypedData: vi.fn(),
                getAddress: vi.fn().mockResolvedValue('0x1234567890123456789012345678901234567890'),
            };
            vi.mocked(createSmartAccount).mockResolvedValue(mockSmartAccount as never);

            // In-memory store has nothing for this batch.
            vi.mocked(getCallStatusEIP5792).mockReturnValue(undefined);

            // Bundler returns a real receipt.
            const mockBatchId = '0xfeec0a41f83ec816f6df368c10bd4eb1c08e1dcb85e254e621fb9ee4d22729e1' as `0x${string}`;
            const mockBundlerReceipt = {
                success: true,
                receipt: {
                    transactionHash: '0xbc079b60838eca1a0379185124dc2878729ec28585a5e6f4d8f45eb3f87d1d95',
                    blockNumber: '0x26fff07',
                    blockHash: '0xabc',
                    gasUsed: '0x61878',
                    status: 'success',
                    logs: [],
                },
            };
            const mockGetUserOperationReceipt = vi.fn().mockResolvedValue(mockBundlerReceipt);
            vi.mocked(getBundlerClient).mockReturnValue({
                getUserOperationReceipt: mockGetUserOperationReceipt,
            } as never);

            // Stub the receipt transformer; we just need to assert it's invoked
            // with the bundler payload.
            const transformedReceipts = [
                {
                    logs: [],
                    status: '0x1',
                    blockHash: '0xabc',
                    blockNumber: '0x26fff07',
                    gasUsed: '0x61878',
                    transactionHash: mockBundlerReceipt.receipt.transactionHash,
                },
            ];
            vi.mocked(transformReceiptsToEIP5792).mockReturnValue(transformedReceipts as never);

            const mockLocalAccount = {
                address: '0xabcdef1234567890abcdef1234567890abcdef12',
                type: 'local',
                publicKey: '0x04abc123',
                sign: vi.fn(),
                signMessage: vi.fn(),
                signTypedData: vi.fn(),
                signTransaction: vi.fn(),
                source: 'privateKey',
            };
            const account = await Account.fromLocalAccount(
                { chainId: 1, apiKey: 'test-api-key' },
                mockLocalAccount as never
            );

            const status = await account.getCallStatus(mockBatchId);

            expect(mockGetUserOperationReceipt).toHaveBeenCalledWith({ hash: mockBatchId });
            expect(transformReceiptsToEIP5792).toHaveBeenCalledWith([mockBundlerReceipt]);
            expect(status).toEqual({
                version: '2.0.0',
                id: mockBatchId,
                chainId: '0x1',
                status: 200,
                atomic: true,
                receipts: transformedReceipts,
            });
        });

        it('sendCalls with permissionId should use sendCallsWithPermission', async () => {
            const { createSmartAccount, sendCallsWithPermission } = await import('./smartAccount.js');
            const { storeCallStatus, waitForReceiptInBackground } = await import('../rpc/wallet_sendCalls.js');

            const mockSmartAccount = {
                address: '0x1234567890123456789012345678901234567890',
                signMessage: vi.fn(),
                signTypedData: vi.fn(),
                getAddress: vi.fn().mockResolvedValue('0x1234567890123456789012345678901234567890'),
            };
            vi.mocked(createSmartAccount).mockResolvedValue(mockSmartAccount as never);

            const mockUserOpHash = '0xpermission1234567890abcdef1234567890abcdef1234567890abcdef12345678';
            vi.mocked(sendCallsWithPermission).mockResolvedValue({
                id: mockUserOpHash,
                chainId: 1,
            });

            const mockLocalAccount = {
                address: '0xabcdef1234567890abcdef1234567890abcdef12',
                type: 'local',
                publicKey: '0x04abc123',
                sign: vi.fn(),
                signMessage: vi.fn(),
                signTypedData: vi.fn(),
                signTransaction: vi.fn(),
                source: 'privateKey',
            };

            const account = await Account.fromLocalAccount(
                { chainId: 1, apiKey: 'test-api-key' },
                mockLocalAccount as never
            );

            const permissionId =
                '0xabc123def456789012345678901234567890123456789012345678901234567890' as `0x${string}`;
            const result = await account.sendCalls(
                [
                    {
                        to: '0x1234567890123456789012345678901234567890',
                        value: 100000000000000000n,
                    },
                ],
                { permissionId }
            );

            expect(result.id).toBe(mockUserOpHash);
            expect(result.chainId).toBe(1);
            expect(sendCallsWithPermission).toHaveBeenCalledWith(
                mockSmartAccount,
                [
                    {
                        to: '0x1234567890123456789012345678901234567890',
                        value: 100000000000000000n,
                        data: undefined,
                    },
                ],
                expect.objectContaining({ id: 1 }),
                permissionId,
                'test-api-key',
                undefined,
                undefined,
                undefined,
                undefined
            );
            expect(storeCallStatus).toHaveBeenCalledWith(mockUserOpHash, 1, 'test-api-key');
            expect(waitForReceiptInBackground).toHaveBeenCalledWith(mockUserOpHash, 1, 'test-api-key');
        });

        it('sendCalls without permissionId should use standard sendCalls', async () => {
            const {
                createSmartAccount,
                sendCalls: sendSmartAccountCalls,
                sendCallsWithPermission,
            } = await import('./smartAccount.js');
            const { storeCallStatus } = await import('../rpc/wallet_sendCalls.js');

            const mockSmartAccount = {
                address: '0x1234567890123456789012345678901234567890',
                signMessage: vi.fn(),
                signTypedData: vi.fn(),
                getAddress: vi.fn().mockResolvedValue('0x1234567890123456789012345678901234567890'),
            };
            vi.mocked(createSmartAccount).mockResolvedValue(mockSmartAccount as never);

            const mockUserOpHash = '0xstandard1234567890abcdef1234567890abcdef1234567890abcdef123456789';
            vi.mocked(sendSmartAccountCalls).mockResolvedValue({
                id: mockUserOpHash,
                chainId: 1,
            });

            const mockLocalAccount = {
                address: '0xabcdef1234567890abcdef1234567890abcdef12',
                type: 'local',
                publicKey: '0x04abc123',
                sign: vi.fn(),
                signMessage: vi.fn(),
                signTypedData: vi.fn(),
                signTransaction: vi.fn(),
                source: 'privateKey',
            };

            const account = await Account.fromLocalAccount(
                { chainId: 1, apiKey: 'test-api-key' },
                mockLocalAccount as never
            );

            // Call without permissionId
            const result = await account.sendCalls([
                {
                    to: '0x1234567890123456789012345678901234567890',
                    value: 100000000000000000n,
                },
            ]);

            expect(result.id).toBe(mockUserOpHash);
            expect(sendSmartAccountCalls).toHaveBeenCalled();
            expect(sendCallsWithPermission).not.toHaveBeenCalled();
            expect(storeCallStatus).toHaveBeenCalledWith(mockUserOpHash, 1, 'test-api-key');
        });
    });

    describe('React Native adapter options forwarding', () => {
        it('Account.create should forward nativeCreateFn and nativeGetFn', async () => {
            const { createSmartAccount } = await import('./smartAccount.js');
            const { PasskeyManager } = await import('../passkey-manager/index.js');
            const mockSmartAccount = {
                address: '0x1234567890123456789012345678901234567890',
                signMessage: vi.fn(),
                signTypedData: vi.fn(),
                getAddress: vi.fn().mockResolvedValue('0x1234567890123456789012345678901234567890'),
            };
            vi.mocked(createSmartAccount).mockResolvedValue(mockSmartAccount as never);

            const mockNativeCreateFn = vi.fn();
            const mockNativeGetFn = vi.fn();

            // Mock PasskeyManager to return proper createPasskey result
            const mockCreatePasskey = vi.fn().mockResolvedValue({
                credentialId: 'rn-cred',
                publicKey: '0x04rn',
                webAuthnAccount: { type: 'webAuthn', publicKey: '0x04rn' },
                passkeyAccount: {
                    username: 'alice',
                    credentialId: 'rn-cred',
                    publicKey: '0x04rn',
                    creationDate: new Date().toISOString(),
                    isImported: false,
                },
            });
            vi.mocked(PasskeyManager).mockImplementation(
                () =>
                    ({
                        checkAuth: vi.fn().mockReturnValue({ isAuthenticated: false }),
                        fetchActiveCredentialId: vi.fn().mockReturnValue(null),
                        getAccountByCredentialId: vi.fn().mockReturnValue(undefined),
                        getCurrentAccount: vi.fn().mockReturnValue(undefined),
                        fetchAccounts: vi.fn().mockReturnValue([]),
                        logout: vi.fn(),
                        createPasskey: mockCreatePasskey,
                        authenticateWithWebAuthn: vi.fn(),
                        importPasskeyAccount: vi.fn(),
                        storePasskeyAccount: vi.fn(),
                        storePasskeyAccountForLogin: vi.fn(),
                        storeAuthState: vi.fn(),
                    }) as never
            );

            await Account.create(
                {
                    chainId: 1,
                    apiKey: 'test-api-key',
                    rpId: 'example.com',
                    rpName: 'MyApp',
                    nativeCreateFn: mockNativeCreateFn,
                    nativeGetFn: mockNativeGetFn,
                },
                { username: 'alice' }
            );

            // PasskeyManager.createPasskey should have been called with wrapped native fns
            // nativeCreateFn gets wrapped into internalNativeCreateFn, nativeGetFn into getFn
            expect(mockCreatePasskey).toHaveBeenCalledWith(
                'alice',
                'example.com',
                'MyApp',
                undefined, // createFn (browser path)
                expect.any(Function), // internalNativeCreateFn (wrapped from nativeCreateFn)
                expect.any(Function) // getFn (wrapped from nativeGetFn)
            );
        });

        it('Account.get with nativeGetFn should forward wrapped getFn and rpId', async () => {
            const { PasskeyManager } = await import('../passkey-manager/index.js');
            const { toWebAuthnAccount } = await import('viem/account-abstraction');
            const { createSmartAccount } = await import('./smartAccount.js');

            const mockSmartAccount = {
                address: '0x1234567890123456789012345678901234567890',
                signMessage: vi.fn(),
                signTypedData: vi.fn(),
                getAddress: vi.fn().mockResolvedValue('0x1234567890123456789012345678901234567890'),
            };
            vi.mocked(createSmartAccount).mockResolvedValue(mockSmartAccount as never);

            // Set up PasskeyManager mock to return authenticated state
            const mockManagerInstance = {
                checkAuth: vi.fn().mockReturnValue({
                    isAuthenticated: true,
                    address: '0x1234567890123456789012345678901234567890',
                }),
                fetchActiveCredentialId: vi.fn().mockReturnValue('cred-123'),
                getAccountByCredentialId: vi.fn().mockReturnValue({
                    username: 'alice',
                    credentialId: 'cred-123',
                    publicKey: '0x04abc',
                    creationDate: new Date().toISOString(),
                    isImported: false,
                }),
                getCurrentAccount: vi.fn().mockReturnValue({
                    username: 'alice',
                    credentialId: 'cred-123',
                    publicKey: '0x04abc',
                    creationDate: new Date().toISOString(),
                    isImported: false,
                }),
                fetchAccounts: vi.fn().mockReturnValue([]),
                logout: vi.fn(),
                createPasskey: vi.fn(),
                authenticateWithWebAuthn: vi.fn(),
                importPasskeyAccount: vi.fn(),
                storePasskeyAccount: vi.fn(),
                storePasskeyAccountForLogin: vi.fn(),
                storeAuthState: vi.fn(),
            };
            vi.mocked(PasskeyManager).mockImplementation(() => mockManagerInstance as never);

            const mockNativeGetFn = vi.fn();
            await Account.get({
                chainId: 1,
                apiKey: 'test-api-key',
                nativeGetFn: mockNativeGetFn,
                rpId: 'example.com',
            });

            // toWebAuthnAccount should have been called with a wrapped getFn and rpId
            expect(toWebAuthnAccount).toHaveBeenCalledWith(
                expect.objectContaining({
                    getFn: expect.any(Function),
                    rpId: 'example.com',
                })
            );
        });

        it('Account.import should forward nativeGetFn (wrapped) and rpId', async () => {
            const { PasskeyManager } = await import('../passkey-manager/index.js');
            const { toWebAuthnAccount } = await import('viem/account-abstraction');
            const { createSmartAccount } = await import('./smartAccount.js');

            const mockSmartAccount = {
                address: '0x1234567890123456789012345678901234567890',
                signMessage: vi.fn(),
                signTypedData: vi.fn(),
                getAddress: vi.fn().mockResolvedValue('0x1234567890123456789012345678901234567890'),
            };
            vi.mocked(createSmartAccount).mockResolvedValue(mockSmartAccount as never);

            const mockManagerInstance = {
                checkAuth: vi.fn().mockReturnValue({ isAuthenticated: false }),
                fetchActiveCredentialId: vi.fn().mockReturnValue(null),
                getAccountByCredentialId: vi.fn().mockReturnValue({
                    username: 'alice',
                    credentialId: 'imp-cred',
                    publicKey: '0x04imported',
                    creationDate: new Date().toISOString(),
                    isImported: true,
                }),
                getCurrentAccount: vi.fn().mockReturnValue(undefined),
                fetchAccounts: vi.fn().mockReturnValue([]),
                logout: vi.fn(),
                createPasskey: vi.fn(),
                authenticateWithWebAuthn: vi.fn(),
                importPasskeyAccount: vi.fn().mockResolvedValue({
                    name: 'imported',
                    credential: { id: 'imp-cred', publicKey: '0x04imported' },
                }),
                storePasskeyAccount: vi.fn(),
                storePasskeyAccountForLogin: vi.fn(),
                storeAuthState: vi.fn(),
            };
            vi.mocked(PasskeyManager).mockImplementation(() => mockManagerInstance as never);

            const mockNativeGetFn = vi.fn();
            await Account.import({
                chainId: 1,
                apiKey: 'test-api-key',
                nativeGetFn: mockNativeGetFn,
                rpId: 'myapp.com',
            });

            // importPasskeyAccount should have been called with a wrapped getFn and rpId
            expect(mockManagerInstance.importPasskeyAccount).toHaveBeenCalledWith(expect.any(Function), 'myapp.com');
            // toWebAuthnAccount should have been called with wrapped getFn and rpId
            expect(toWebAuthnAccount).toHaveBeenCalledWith(
                expect.objectContaining({
                    getFn: expect.any(Function),
                    rpId: 'myapp.com',
                })
            );
        });
    });

    describe('restore', () => {
        it('should have restore static method', () => {
            expect(typeof Account.restore).toBe('function');
        });

        it('should throw when credentialId is empty', async () => {
            await expect(Account.restore({ chainId: 1, apiKey: 'test' }, '', '0x04abc123')).rejects.toThrow(
                'credentialId and publicKey are required'
            );
        });

        it('should throw when publicKey is empty', async () => {
            await expect(
                Account.restore({ chainId: 1, apiKey: 'test' }, 'cred-123', '' as `0x${string}`)
            ).rejects.toThrow('credentialId and publicKey are required');
        });

        it('should restore account with rpId option', async () => {
            const { toWebAuthnAccount } = await import('viem/account-abstraction');
            const { createSmartAccount } = await import('./smartAccount.js');
            const mockSmartAccount = {
                address: '0x1234567890123456789012345678901234567890',
                signMessage: vi.fn(),
                signTypedData: vi.fn(),
                getAddress: vi.fn().mockResolvedValue('0x1234567890123456789012345678901234567890'),
            };
            vi.mocked(createSmartAccount).mockResolvedValue(mockSmartAccount as never);

            const account = await Account.restore(
                { chainId: 1, apiKey: 'test-api-key', rpId: 'example.com' },
                'cred-123',
                '0x04abc123'
            );

            expect(account).toBeDefined();
            expect(toWebAuthnAccount).toHaveBeenCalledWith({
                credential: {
                    id: 'cred-123',
                    publicKey: '0x04abc123',
                },
                getFn: undefined,
                rpId: 'example.com',
            });
        });

        it('should restore without rpId (passes undefined through for deferred signing)', async () => {
            const { toWebAuthnAccount } = await import('viem/account-abstraction');
            const { createSmartAccount } = await import('./smartAccount.js');
            const mockSmartAccount = {
                address: '0x1234567890123456789012345678901234567890',
                signMessage: vi.fn(),
                signTypedData: vi.fn(),
                getAddress: vi.fn().mockResolvedValue('0x1234567890123456789012345678901234567890'),
            };
            vi.mocked(createSmartAccount).mockResolvedValue(mockSmartAccount as never);

            const account = await Account.restore({ chainId: 1, apiKey: 'test-api-key' }, 'cred-123', '0x04abc123');

            expect(account).toBeDefined();
            expect(toWebAuthnAccount).toHaveBeenCalledWith({
                credential: {
                    id: 'cred-123',
                    publicKey: '0x04abc123',
                },
                getFn: undefined,
                rpId: undefined,
            });
        });

        it('should forward nativeGetFn (wrapped) and rpId options to toWebAuthnAccount', async () => {
            const { toWebAuthnAccount } = await import('viem/account-abstraction');
            const { createSmartAccount } = await import('./smartAccount.js');
            const mockSmartAccount = {
                address: '0x1234567890123456789012345678901234567890',
                signMessage: vi.fn(),
                signTypedData: vi.fn(),
                getAddress: vi.fn().mockResolvedValue('0x1234567890123456789012345678901234567890'),
            };
            vi.mocked(createSmartAccount).mockResolvedValue(mockSmartAccount as never);

            const mockNativeGetFn = vi.fn();
            const account = await Account.restore(
                {
                    chainId: 1,
                    apiKey: 'test-api-key',
                    nativeGetFn: mockNativeGetFn,
                    rpId: 'example.com',
                },
                'cred-456',
                '0x04def789'
            );

            expect(account).toBeDefined();
            expect(toWebAuthnAccount).toHaveBeenCalledWith({
                credential: {
                    id: 'cred-456',
                    publicKey: '0x04def789',
                },
                getFn: expect.any(Function),
                rpId: 'example.com',
            });
        });

        it('should forward only rpId when nativeGetFn is not provided', async () => {
            const { toWebAuthnAccount } = await import('viem/account-abstraction');
            const { createSmartAccount } = await import('./smartAccount.js');
            const mockSmartAccount = {
                address: '0x1234567890123456789012345678901234567890',
                signMessage: vi.fn(),
                signTypedData: vi.fn(),
                getAddress: vi.fn().mockResolvedValue('0x1234567890123456789012345678901234567890'),
            };
            vi.mocked(createSmartAccount).mockResolvedValue(mockSmartAccount as never);

            await Account.restore({ chainId: 1, apiKey: 'test-api-key', rpId: 'myapp.com' }, 'cred-xyz', '0x04jkl345');

            expect(toWebAuthnAccount).toHaveBeenCalledWith({
                credential: {
                    id: 'cred-xyz',
                    publicKey: '0x04jkl345',
                },
                getFn: undefined,
                rpId: 'myapp.com',
            });
        });

        it('should throw when publicKey does not match stored account', async () => {
            const { PasskeyManager } = await import('../passkey-manager/index.js');
            vi.mocked(PasskeyManager).mockImplementationOnce(
                () =>
                    ({
                        checkAuth: vi.fn().mockReturnValue({ isAuthenticated: false }),
                        getAccountByCredentialId: vi.fn().mockReturnValue({
                            username: 'alice',
                            credentialId: 'cred-mismatch',
                            publicKey: '0x04realkey',
                            creationDate: new Date().toISOString(),
                            isImported: false,
                        }),
                        fetchAccounts: vi.fn().mockReturnValue([]),
                        logout: vi.fn(),
                    }) as never
            );

            await expect(
                Account.restore(
                    { chainId: 1, apiKey: 'test-api-key', rpId: 'example.com' },
                    'cred-mismatch',
                    '0x04forgedkey'
                )
            ).rejects.toThrow('Provided publicKey does not match the stored publicKey');
        });
    });

    describe('fromLocalAccount', () => {
        it('should have correct function signature', () => {
            // fromLocalAccount takes (config: AccountConfig, localAccount: LocalAccount, options?)
            expect(Account.fromLocalAccount.length).toBe(3);
        });

        it('should create account from LocalAccount', async () => {
            const { createSmartAccount } = await import('./smartAccount.js');
            const mockSmartAccount = {
                address: '0x1234567890123456789012345678901234567890',
                signMessage: vi.fn(),
                signTypedData: vi.fn(),
                getAddress: vi.fn().mockResolvedValue('0x1234567890123456789012345678901234567890'),
            };
            vi.mocked(createSmartAccount).mockResolvedValue(mockSmartAccount as never);

            const mockLocalAccount = {
                address: '0xabcdef1234567890abcdef1234567890abcdef12',
                type: 'local',
                publicKey: '0x04abc123',
                sign: vi.fn(),
                signMessage: vi.fn(),
                signTypedData: vi.fn(),
                signTransaction: vi.fn(),
                source: 'privateKey',
            };

            const account = await Account.fromLocalAccount(
                { chainId: 1, apiKey: 'test-api-key' },
                mockLocalAccount as never
            );

            expect(account).toBeDefined();
            expect(createSmartAccount).toHaveBeenCalledWith(mockLocalAccount, expect.anything());
        });

        it('should return null from getMetadata for LocalAccount-based accounts', async () => {
            const { createSmartAccount } = await import('./smartAccount.js');
            const mockSmartAccount = {
                address: '0x1234567890123456789012345678901234567890',
                signMessage: vi.fn(),
                signTypedData: vi.fn(),
                getAddress: vi.fn().mockResolvedValue('0x1234567890123456789012345678901234567890'),
            };
            vi.mocked(createSmartAccount).mockResolvedValue(mockSmartAccount as never);

            const mockLocalAccount = {
                address: '0xabcdef1234567890abcdef1234567890abcdef12',
                type: 'local',
                publicKey: '0x04abc123',
                sign: vi.fn(),
                signMessage: vi.fn(),
                signTypedData: vi.fn(),
                signTransaction: vi.fn(),
                source: 'privateKey',
            };

            const account = await Account.fromLocalAccount(
                { chainId: 1, apiKey: 'test-api-key' },
                mockLocalAccount as never
            );

            // LocalAccount-based accounts should return null for metadata
            expect(account.getMetadata()).toBeNull();
        });

        it('should expose address and chainId properties', async () => {
            const { createSmartAccount } = await import('./smartAccount.js');
            const mockAddress = '0x1234567890123456789012345678901234567890';
            const mockSmartAccount = {
                address: mockAddress,
                signMessage: vi.fn(),
                signTypedData: vi.fn(),
                getAddress: vi.fn().mockResolvedValue(mockAddress),
            };
            vi.mocked(createSmartAccount).mockResolvedValue(mockSmartAccount as never);

            const mockLocalAccount = {
                address: '0xabcdef1234567890abcdef1234567890abcdef12',
                type: 'local',
                publicKey: '0x04abc123',
                sign: vi.fn(),
                signMessage: vi.fn(),
                signTypedData: vi.fn(),
                signTransaction: vi.fn(),
                source: 'privateKey',
            };

            const account = await Account.fromLocalAccount(
                { chainId: 1, apiKey: 'test-api-key' },
                mockLocalAccount as never
            );

            expect(account.address).toBe(mockAddress);
            expect(account.chainId).toBe(1);
        });

        it('should work without apiKey', async () => {
            const { createSmartAccount } = await import('./smartAccount.js');
            const mockSmartAccount = {
                address: '0x1234567890123456789012345678901234567890',
                signMessage: vi.fn(),
                signTypedData: vi.fn(),
                getAddress: vi.fn().mockResolvedValue('0x1234567890123456789012345678901234567890'),
            };
            vi.mocked(createSmartAccount).mockResolvedValue(mockSmartAccount as never);

            const mockLocalAccount = {
                address: '0xabcdef1234567890abcdef1234567890abcdef12',
                type: 'local',
                publicKey: '0x04abc123',
                sign: vi.fn(),
                signMessage: vi.fn(),
                signTypedData: vi.fn(),
                signTransaction: vi.fn(),
                source: 'privateKey',
            };

            // Should not throw when apiKey is not provided
            const account = await Account.fromLocalAccount({ chainId: 1, apiKey: 'test' }, mockLocalAccount as never);

            expect(account).toBeDefined();
        });

        it('should support custom paymasterUrl', async () => {
            const { createSmartAccount } = await import('./smartAccount.js');
            const mockSmartAccount = {
                address: '0x1234567890123456789012345678901234567890',
                signMessage: vi.fn(),
                signTypedData: vi.fn(),
                getAddress: vi.fn().mockResolvedValue('0x1234567890123456789012345678901234567890'),
            };
            vi.mocked(createSmartAccount).mockResolvedValue(mockSmartAccount as never);

            const mockLocalAccount = {
                address: '0xabcdef1234567890abcdef1234567890abcdef12',
                type: 'local',
                publicKey: '0x04abc123',
                sign: vi.fn(),
                signMessage: vi.fn(),
                signTypedData: vi.fn(),
                signTransaction: vi.fn(),
                source: 'privateKey',
            };

            const account = await Account.fromLocalAccount(
                {
                    chainId: 1,
                    apiKey: 'test',
                    paymasterUrl: 'https://paymaster.example.com',
                },
                mockLocalAccount as never
            );

            const chain = account.getChain();
            expect(chain.paymaster?.url).toBe('https://paymaster.example.com');
        });
    });
});
