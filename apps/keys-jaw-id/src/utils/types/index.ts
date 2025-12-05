import { AppMetadata, SDKRequestType } from "../../lib/sdk-types";
import { ModeType } from "@jaw.id/core";

export type ChainId = 1 | 11155111;

export interface PopupConfig {
    version: string;
    metadata: AppMetadata;
    preference: {
      options?: string;
      keysUrl: string;
      attribution?: Record<string, unknown>;
      mode?: ModeType;
      serverUrl?: string;
      ens?: string;
    };
    location: string;
    apiKey: string;
  }
  
  export interface PendingRequest {
    origin: string;
    type: SDKRequestType;
    requestId: string;
    correlationId: string;
    metadata: AppMetadata | null;
    method: string;
    params: unknown[];
    chain?: {
      id: number;
      rpcUrl: string;
      paymasterUrl?: string;
    } | undefined;
    onApprove: (result: unknown) => Promise<void>;
    onReject: (error: string, errorCode?: number) => Promise<void>;
  }