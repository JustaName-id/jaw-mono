import { AppMetadata, SDKRequestType } from '../../lib/sdk-types';
import { ModeType, type AccountHintData, type JawTheme } from '@jaw.id/core';

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
  /**
   * The dApp's API key, seeded from the SDK store onto the transport config
   * message. Absent when the SDK is older or no key is configured — the
   * handshake's chain.rpcUrl key remains the authoritative source.
   */
  apiKey?: string;
  /**
   * One-shot popup intent from the SDK: 'create' when the embedded iframe
   * escaped to this popup so the user can CREATE a passkey (Safari blocks
   * WebAuthn create() in cross-origin iframes) — open on the create view
   * instead of "Continue as".
   */
  intent?: 'create';
  /**
   * Last account the user connected with, persisted dApp-side by the SDK.
   * Seeds the "Continue as" screen when our own (partitioned, Brave/Safari-
   * ephemeral) storage came up empty. Untrusted input — a credentialId
   * pointer only, validated and then resolved against the backend registry.
   */
  lastAccount?: AccountHintData;
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
