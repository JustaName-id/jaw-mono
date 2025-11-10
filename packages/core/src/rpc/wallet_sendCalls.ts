import { store } from '../store/index.js';
import { getBundlerClient } from '../store/chain-clients/utils.js';
import type { BundlerClient } from 'viem/account-abstraction';

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

