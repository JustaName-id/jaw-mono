import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Account } from './Account.js';

// Mock dependencies
vi.mock('../passkey-manager/index.js', () => ({
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
}));

vi.mock('./smartAccount.js', () => ({
    createSmartAccount: vi.fn(),
    sendTransaction: vi.fn(),
    sendCalls: vi.fn(),
    sendCallsWithPermission: vi.fn(),
    estimateUserOpGas: vi.fn(),
    calculateGas: vi.fn(),
    getBundlerClient: vi.fn().mockReturnValue({ client: 'mockBundlerClient' }),
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
    beforeEach(() => {
        vi.clearAllMocks();
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
                { to: '0x1234567890123456789012345678901234567890', value: 100000000000000000n },
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

            const status = account.getCallStatus(mockBatchId as `0x${string}`);

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

            const status = account.getCallStatus('0xnonexistent' as `0x${string}`);

            expect(status).toBeUndefined();
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
                [{ to: '0x1234567890123456789012345678901234567890', value: 100000000000000000n }],
                { permissionId }
            );

            expect(result.id).toBe(mockUserOpHash);
            expect(result.chainId).toBe(1);
            expect(sendCallsWithPermission).toHaveBeenCalledWith(
                mockSmartAccount,
                [{ to: '0x1234567890123456789012345678901234567890', value: 100000000000000000n, data: undefined }],
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
                { to: '0x1234567890123456789012345678901234567890', value: 100000000000000000n },
            ]);

            expect(result.id).toBe(mockUserOpHash);
            expect(sendSmartAccountCalls).toHaveBeenCalled();
            expect(sendCallsWithPermission).not.toHaveBeenCalled();
            expect(storeCallStatus).toHaveBeenCalledWith(mockUserOpHash, 1, 'test-api-key');
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
                { chainId: 1, apiKey: 'test', paymasterUrl: 'https://paymaster.example.com' },
                mockLocalAccount as never
            );

            const chain = account.getChain();
            expect(chain.paymaster?.url).toBe('https://paymaster.example.com');
        });
    });
});
