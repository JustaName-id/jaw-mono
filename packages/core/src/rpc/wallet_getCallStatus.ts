import { getCallStatusEIP5792 } from "./wallet_sendCalls.js";
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
    
    // Get status in EIP-5792 format
    const result = getCallStatusEIP5792(batchId);
    
    if (!result) {
        throw standardErrors.rpc.invalidParams(`No call status found for batchId: ${batchId}`);
    }
    
    return result;
}