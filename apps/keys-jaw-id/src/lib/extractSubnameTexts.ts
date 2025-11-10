import { SDKRequestType } from "./sdk-types";
import type { PendingRequest } from "../utils/types";

/**
 * Helper function to extract subnameTextRecords from pending request.
 * 
 * Note: This is only used during NEW account creation, not when connecting to existing accounts.
 * Text records are set at subname creation time, so they're only relevant when creating a new account.
 */
export function extractSubnameTextRecords(pendingRequest: PendingRequest | null): Array<{ key: string; value: string }> | undefined {
    if (pendingRequest?.type !== SDKRequestType.CONNECT) {
      return undefined;
    }
  
    const params = pendingRequest.params;
    if (!Array.isArray(params) || params.length === 0) {
      return undefined;
    }
  
    const firstParam = params[0];
    if (typeof firstParam !== 'object' || firstParam === null) {
      return undefined;
    }
  
    const capabilities = (firstParam as { capabilities?: { subnameTextRecords?: Array<{ key: string; value: string }> } }).capabilities;
    return capabilities?.subnameTextRecords;
  }
  