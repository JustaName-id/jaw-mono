/**
 * TypeScript types for Coinbase SDK postMessage communication
 */

export interface URLParams {
  sdkName: string;
  sdkVersion: string;
  origin: string | null; // Can be null, will be set dynamically from first message
  coop: string | null;
}

export interface PopupLoadedEvent {
  event: 'PopupLoaded';
  id: string;
}

export interface PopupUnloadEvent {
  event: 'PopupUnload';
  id: string;
}

export interface AppMetadata {
  appName: string;
  appLogoUrl: string;
  defaultChainId?: number;
  appChainIds?: number[];
}

export interface SDKPreference {
  options: string;
  keysUrl: string;
  attribution?: Record<string, unknown>;
}

export interface ConfigResponse {
  requestId: string;
  data: {
    version: string;
    metadata: AppMetadata;
    preference: SDKPreference;
    location: string;
  };
}

export interface RPCHandshake {
  method: string;
  params: unknown[];
}

export interface EncryptedContent {
  encrypted: {
    iv: Uint8Array;
    cipherText: ArrayBuffer;
  };
}

// RPC Request can be either handshake (unencrypted) or encrypted
export interface RPCRequest {
  id: string;
  correlationId: string;
  sender: string;
  content: {
    handshake?: RPCHandshake;
    encrypted?: {
      iv: Uint8Array;
      cipherText: ArrayBuffer;
    };
  };
  timestamp: string;
}

// Chain type definition
export type chain = {
  id: number;
  rpcUrl?: string;
  paymasterUrl?: string;
};

// Decrypted content from encrypted requests
export interface DecryptedRequest {
  action: {
    method: string;
    params: unknown[];
  };
  chain: chain;
}

// Response payload structure (what gets encrypted)
export interface ResponsePayload {
  result: {
    value?: unknown;
    error?: { code: number; message: string };
  };
  data?: {
    chains?: Record<string, string>;
    capabilities?: Record<string, any>;
    nativeCurrencies?: Record<string, any>;
  };
}

export interface RPCResponse {
  requestId: string;
  id: string;
  sender: string;
  correlationId: string;
  content: EncryptedContent;
  timestamp: Date;
}

export interface MessageEvent<T = unknown> {
  data: T;
  origin: string;
  source: Window | null;
}

export type SDKMessage = PopupLoadedEvent | PopupUnloadEvent | ConfigResponse | RPCRequest | RPCResponse;

export interface RPCMethod {
  method: string;
  params: unknown[];
}

export interface EthRequestAccountsMethod extends RPCMethod {
  method: 'eth_requestAccounts';
  params: [];
}

export interface PersonalSignMethod extends RPCMethod {
  method: 'personal_sign';
  params: [string, string]; // [message, address]
}

export interface WalletSendCallsMethod extends RPCMethod {
  method: 'wallet_sendCalls';
  params: [{
    version: string;
    from: string;
    calls: Array<{
      to: string;
      value?: string;
      data?: string;
    }>;
  }];
}

export interface EthChainIdMethod extends RPCMethod {
  method: 'eth_chainId';
  params: [];
}

export interface WalletGetSubAccountsMethod extends RPCMethod {
  method: 'wallet_getSubAccounts';
  params: [];
}

export interface WalletImportSubAccountMethod extends RPCMethod {
  method: 'wallet_importSubAccount';
  params: [{
    address: string;
    publicKey: string;
  }];
}

export type SupportedRPCMethod =
  | EthRequestAccountsMethod
  | PersonalSignMethod
  | WalletSendCallsMethod
  | EthChainIdMethod
  | WalletGetSubAccountsMethod
  | WalletImportSubAccountMethod;

export interface SDKState {
  isInitialized: boolean;
  config: ConfigResponse['data'] | null;
  urlParams: URLParams | null;
  allowedOrigin: string | null;
  currentRequest: RPCRequest | null;
  senderPublicKey: string; // Your wallet's public key
}

export enum SDKRequestType {
  CONNECT = 'connect',
  SIGN_MESSAGE = 'sign_message',
  SIGN_TYPED_DATA = 'sign_typed_data',
  SEND_TRANSACTION = 'send_transaction',
  CHAIN_ID = 'chain_id',
  GET_SUB_ACCOUNTS = 'get_sub_accounts',
  IMPORT_SUB_ACCOUNT = 'import_sub_account',
}

export interface SDKRequestUI {
  type: SDKRequestType;
  request: RPCRequest;
  metadata: AppMetadata | null;
  // Normalized method and params (works for both handshake and encrypted requests)
  method: string;
  params: unknown[];
  chainId?: number;
  onApprove: (result: unknown) => Promise<void>; // Now async
  onReject: (error: string) => Promise<void>; // Now async
}

// Event messages (selectSignerType, etc.)
export interface SDKEventMessage {
  id: string;
  event: 'selectSignerType' | 'PopupLoaded' | 'PopupUnload';
  data?: unknown;
}
