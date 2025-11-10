import { store } from '../store/index.js';
import { getBundlerClient } from '../store/chain-clients/utils.js';
import type { BundlerClient } from 'viem/account-abstraction';
import { numberToHex } from 'viem';

/**
 * Stores a call status as pending when wallet_sendCalls is called
 * @param userOpHash - The user operation hash returned from sendUserOperation
 * @param chainId - The chain ID where the operation was submitted
 */
export function storeCallStatus(userOpHash: string, chainId: number): void {
    store.callStatuses.set(userOpHash, {
        status: 'pending',
        chainId,
    });
}

/**
 * Updates call status to completed when receipt is received
 * @param userOpHash - The user operation hash
 * @param receipts - The receipts from waitForUserOperationReceipt
 */
export function updateCallStatusToCompleted(userOpHash: string, receipts: unknown[]): void {
    store.callStatuses.update(userOpHash, {
        status: 'completed',
        receipts,
    });
}

/**
 * Updates call status to failed when an error occurs
 * @param userOpHash - The user operation hash
 * @param error - The error message or object
 */
export function updateCallStatusToFailed(userOpHash: string, error: string | Error): void {
    const errorMessage = error instanceof Error ? error.message : String(error);
    store.callStatuses.update(userOpHash, {
        status: 'failed',
        error: errorMessage,
    });
}

/**
 * Gets the call status for a given batch ID (userOpHash)
 * @param batchId - The batch ID (userOpHash) to get status for
 * @returns The call status or undefined if not found
 */
export function getCallStatus(batchId: string) {
    return store.callStatuses.get(batchId);
}

/**
 * Transforms receipts to EIP-5792 format
 * @param receipts - Raw receipts from storage
 * @returns Transformed receipts in EIP-5792 format
 */
export function transformReceiptsToEIP5792(receipts: unknown[]): Array<{
    logs: Array<{
        address: `0x${string}`;
        data: `0x${string}`;
        topics: `0x${string}`[];
    }>;
    status: `0x${string}`;
    blockHash: `0x${string}`;
    blockNumber: `0x${string}`;
    gasUsed: `0x${string}`;
    transactionHash: `0x${string}`;
}> {
    if (!receipts || receipts.length === 0) {
        return [];
    }

    return receipts.map((receipt: any) => {
        // Handle different receipt formats
        // Format 1: Direct receipt object (from waitForUserOperationReceipt)
        // Format 2: Wrapped receipt with userOpHash, receipt field, etc.
        const actualReceipt = receipt.receipt || receipt;
        
        // Extract logs - prefer logs from actualReceipt, fallback to top-level logs
        // Logs should only include those relevant to the user operation
        const logs = (actualReceipt.logs || receipt.logs || []).map((log: any) => ({
            address: log.address as `0x${string}`,
            data: log.data || '0x' as `0x${string}`,
            topics: (log.topics || []) as `0x${string}`[],
        }));

        // Determine status: 0x1 for success, 0x0 for failure
        // Check receipt.status, receipt.success, or actualReceipt.status
        const success = actualReceipt.status === '0x1' || 
                       actualReceipt.status === 1 ||
                       receipt.success === true ||
                       actualReceipt.success === true ||
                       (actualReceipt.status === undefined && actualReceipt.transactionHash !== undefined);
        const status = success ? '0x1' as `0x${string}` : '0x0' as `0x${string}`;

        // Extract required fields - prefer actualReceipt, fallback to top-level receipt
        const blockHash = (actualReceipt.blockHash || receipt.blockHash) as `0x${string}`;
        const blockNumberRaw = actualReceipt.blockNumber ?? receipt.blockNumber;
        // Ensure blockNumber is always in hex format
        const blockNumber = typeof blockNumberRaw === 'string' 
            ? (blockNumberRaw.startsWith('0x') ? blockNumberRaw as `0x${string}` : numberToHex(BigInt(blockNumberRaw)) as `0x${string}`)
            : numberToHex(blockNumberRaw) as `0x${string}`;
        const gasUsedRaw = actualReceipt.gasUsed ?? receipt.gasUsed;
        // Ensure gasUsed is always in hex format
        const gasUsed = typeof gasUsedRaw === 'string'
            ? (gasUsedRaw.startsWith('0x') ? gasUsedRaw as `0x${string}` : numberToHex(BigInt(gasUsedRaw)) as `0x${string}`)
            : numberToHex(gasUsedRaw) as `0x${string}`;
        const transactionHash = (actualReceipt.transactionHash || receipt.transactionHash) as `0x${string}`;

        return {
            logs,
            status,
            blockHash,
            blockNumber,
            gasUsed,
            transactionHash,
        };
    });
}

/**
 * Gets the call status in EIP-5792 format
 * @param batchId - The batch ID (userOpHash) to get status for
 * @returns EIP-5792 formatted response or undefined if not found
 */
    export function getCallStatusEIP5792(batchId: string): {
        version: string;
    id: `0x${string}`;
    chainId: `0x${string}`;
    status: number;
    atomic: boolean;
    receipts?: Array<{
        logs: Array<{
            address: `0x${string}`;
            data: `0x${string}`;
            topics: `0x${string}`[];
        }>;
        status: `0x${string}`;
        blockHash: `0x${string}`;
        blockNumber: `0x${string}`;
        gasUsed: `0x${string}`;
        transactionHash: `0x${string}`;
    }>;
} | undefined {
    const callStatus = getCallStatus(batchId);
    
    if (!callStatus) {
        return undefined;
    }
    
    // Return status in expected format
    // Status codes: 100 = pending, 200 = completed, 400 = failed
    let statusCode = 100; // pending
    if (callStatus.status === 'completed') {
        statusCode = 200;
    } else if (callStatus.status === 'failed') {
        statusCode = 400;
    }

    // Transform receipts to EIP-5792 format
    const transformedReceipts = callStatus.receipts 
        ? transformReceiptsToEIP5792(callStatus.receipts)
        : undefined;

    // Format chainId as hex string
    const chainId = callStatus.chainId ?? 1;
    const chainIdHex = numberToHex(chainId) as `0x${string}`;

    // Return in EIP-5792 format
    return {
        version: '2.0.0',
        id: batchId as `0x${string}`,
        chainId: chainIdHex,
        status: statusCode,
        atomic: true, // ERC-4337 user operations are atomic
        receipts: transformedReceipts,
    };
}

/**
 * Starts a background task to wait for user operation receipt
 * This function does NOT await - it runs in the background
 * @param userOpHash - The user operation hash to wait for
 * @param chainId - The chain ID where the operation was submitted
 */
export async function waitForReceiptInBackground(userOpHash: string, chainId: number): Promise<void> {
    try {
        // Get bundler client for the chain
        const bundlerClient = getBundlerClient(chainId);
        if (!bundlerClient) {
            const error = new Error(`No bundler client found for chain ${chainId}`);
            updateCallStatusToFailed(userOpHash, error);
            return;
        }

        // Wait for receipt (this may take a while)
        // Status remains 'pending' while waiting
        const receipt = await (bundlerClient as BundlerClient).waitForUserOperationReceipt({
            hash: userOpHash as `0x${string}`,
        });

        // TODO: Check receipt status to determine if transaction succeeded or failed
        

        // Update storage when done - mark as completed
        updateCallStatusToCompleted(userOpHash, [receipt]);
    } catch (error) {
        console.error(`Error waiting for receipt for ${userOpHash}:`, error);
        // Update status to failed on error
        updateCallStatusToFailed(userOpHash, error as Error);
    }
}

