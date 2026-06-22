import { AppMetadata, SDKRequestType } from '../../lib/sdk-types';
import { ModeType, type JawTheme } from '@jaw.id/core';

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
  /** dApp theme tokens forwarded by the SDK so the embedded dialog matches its look & feel. */
  theme?: JawTheme;
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
  chain?:
    | {
        id: number;
        rpcUrl: string;
        paymasterUrl?: string;
        paymasterContext?: Record<string, unknown>;
      }
    | undefined;
  onApprove: (result: unknown) => Promise<void>;
  onReject: (error: string, errorCode?: number) => Promise<void>;
}
