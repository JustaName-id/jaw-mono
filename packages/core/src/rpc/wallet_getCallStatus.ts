import { getCallStatusEIP5792, getCallStatus, waitForReceiptInBackground } from "./wallet_sendCalls.js";
import { standardErrors } from "../errors/index.js";
import { RequestArguments } from '../provider/index.js';

export async function handleGetCallsStatusRequest(request: RequestArguments) {
    // Extract batchId from params
    const batchId = Array.isArray(request.params) && request.params[0]
        ? String(request.params[0])
        : undefined;

    if (!batchId) {
        throw standardErrors.rpc.invalidParams('batchId is required');
    }

    // Get current status
    const callStatus = getCallStatus(batchId);

    if (!callStatus) {
        throw standardErrors.rpc.invalidParams(`No call status found for batchId: ${batchId}`);
    }

    // If status is still pending, re-trigger receipt polling in background
    // This handles cases where the initial polling timed out but the operation may have succeeded
    if (callStatus.status === 'pending' && callStatus.chainId) {
        waitForReceiptInBackground(batchId, callStatus.chainId);
    }

    // Return status in EIP-5792 format
    return getCallStatusEIP5792(batchId);
}