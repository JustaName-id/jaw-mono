import { Address } from '../provider/interface.js';

/**
 * UI request types that require user interaction
 */
export type UIRequestType =
  | 'wallet_connect'
  | 'wallet_sendCalls'
  | 'eth_sendTransaction'
  | 'wallet_grantPermissions'
  | 'wallet_revokePermissions'
  | 'personal_sign'
  | 'eth_signTypedData_v4'
  | 'wallet_sign';

/**
 * Base structure for all UI requests
 */
export interface BaseUIRequest {
  id: string;
  type: UIRequestType;
  timestamp: number;
  correlationId?: string;
}

/**
 * Connect request (wallet_connect, eth_requestAccounts)
 */
export interface ConnectUIRequest extends BaseUIRequest {
  type: 'wallet_connect';
  data: {
    appName: string;
    appLogoUrl: string | null;
    origin: string;
    chainId: number;
    capabilities?: Record<string, unknown>;
  };
}

/**
 * Signature request (personal_sign)
 */
export interface SignatureUIRequest extends BaseUIRequest {
  type: 'personal_sign';
  data: {
    message: string;
    address: Address;
    chainId: number;
  };
}

/**
 * EIP-712 typed data signing request
 */
export interface TypedDataUIRequest extends BaseUIRequest {
  type: 'eth_signTypedData_v4';
  data: {
    typedData: string; // JSON string
    address: Address;
    chainId: number;
  };
}

/**
 * Permissions capability for wallet_sendCalls
 */
export interface PermissionsCapability {
  /** ID of the permission to use for execution */
  id: `0x${string}`;
}

/**
 * Transaction request (wallet_sendCalls)
 */
export interface TransactionUIRequest extends BaseUIRequest {
  type: 'wallet_sendCalls';
  data: {
    version: '1.0';
    from: Address;
    calls: Array<{
      to: string;
      value?: string;
      data?: string;
    }>;
    chainId: number;
    atomicRequired?: boolean;
    /** Capabilities for the transaction */
    capabilities?: {
      /** Permissions capability - when provided, executes calls using the specified permission */
      permissions?: PermissionsCapability;
    };
  };
}

/**
 * Legacy transaction request (eth_sendTransaction)
 * Returns a transaction hash string instead of { id, chainId }
 */
export interface SendTransactionUIRequest extends BaseUIRequest {
  type: 'eth_sendTransaction';
  data: {
    from: Address;
    to: Address;
    value?: string;
    data?: string;
    gas?: string;
    gasPrice?: string;
    maxFeePerGas?: string;
    maxPriorityFeePerGas?: string;
    nonce?: string;
    chainId: number;
  };
}

/**
 * Permission grant request (wallet_grantPermissions)
 */
export interface PermissionUIRequest extends BaseUIRequest {
  type: 'wallet_grantPermissions';
  data: {
    address: Address;
    chainId: number | string; // can be hex string like '0x1'
    expiry: number;
    spender: Address;
    permissions: {
      spends?: Array<{
        limit: string;
        period: 'minute' | 'hour' | 'day' | 'week' | 'month' | 'year' | 'forever';
        token: Address;
      }>;
      calls?: Array<{
        target: Address;
        /** Function selector (4 bytes, hex format) - computed from functionSignature if not provided */
        selector?: `0x${string}`;
        /** Human-readable function signature (e.g., "transfer(address,uint256)") */
        functionSignature?: string;
      }>;
    };
  };
}

/**
 * Permission revoke request (wallet_revokePermissions)
 */
export interface RevokePermissionUIRequest extends BaseUIRequest {
  type: 'wallet_revokePermissions';
  data: {
    permissionId: string;
    address: Address;
    chainId?: number;
  };
}

/**
 * ERC-7871 PersonalSign request data
 */
export interface PersonalSignRequestData {
  type: '0x45';
  data: {
    message: string; // UTF-8 message string
  };
}

/**
 * ERC-7871 TypedData request data
 */
export interface TypedDataRequestData {
  type: '0x01';
  data: Record<string, unknown>; // TypedData as defined by EIP-712
}

/**
 * Wallet sign request (wallet_sign) - ERC-7871
 * Type 0x45 = personal sign, Type 0x01 = EIP-712 typed data
 */
export interface WalletSignUIRequest extends BaseUIRequest {
  type: 'wallet_sign';
  data: {
    address: Address;
    chainId?: number;
    request: PersonalSignRequestData | TypedDataRequestData;
  };
}

/**
 * Discriminated union of all UI request types
 */
export type UIRequest =
  | ConnectUIRequest
  | SignatureUIRequest
  | TypedDataUIRequest
  | TransactionUIRequest
  | SendTransactionUIRequest
  | PermissionUIRequest
  | RevokePermissionUIRequest
  | WalletSignUIRequest;

/**
 * UI response structure
 */
export interface UIResponse<T = unknown> {
  id: string;
  approved: boolean;
  data?: T;
  error?: UIError;
}

/**
 * UI-specific errors
 */
export enum UIErrorCode {
  USER_REJECTED = 4001,
  TIMEOUT = 4002,
  UNSUPPORTED_REQUEST = 4003,
  HANDLER_NOT_AVAILABLE = 4004,
}

export class UIError extends Error {
  code: UIErrorCode;

  constructor(code: UIErrorCode, message: string) {
    super(message);
    this.name = 'UIError';
    this.code = code;
  }

  static userRejected(message = 'User rejected the request'): UIError {
    return new UIError(UIErrorCode.USER_REJECTED, message);
  }

  static timeout(message = 'Request timed out'): UIError {
    return new UIError(UIErrorCode.TIMEOUT, message);
  }

  static unsupportedRequest(type: string): UIError {
    return new UIError(
      UIErrorCode.UNSUPPORTED_REQUEST,
      `Unsupported UI request type: ${type}`
    );
  }

  static handlerNotAvailable(): UIError {
    return new UIError(
      UIErrorCode.HANDLER_NOT_AVAILABLE,
      'No UI handler available for app-specific mode'
    );
  }
}

/**
 * Configuration passed to UIHandler during initialization
 * Contains SDK configuration that the UI handler may need
 */
export interface UIHandlerConfig {
  /** JAW API key for RPC URL resolution (required) */
  apiKey: string;
  /** Default chain ID */
  defaultChainId?: number;
  /** Paymaster URLs per chain for gasless transactions */
  paymasterUrls?: Record<number, string>;
  /** App name shown in dialogs */
  appName?: string;
  /** App logo URL */
  appLogoUrl?: string | null;
  /** ENS to issue subnames from */
  ens?: string;
  /** Whether to show testnet chains */
  showTestnets?: boolean;
}

/**
 * Platform-agnostic UI handler interface
 *
 * Implement this interface to provide custom UI for app-specific mode.
 * The SDK will call the request method when user approval is needed.
 */
export interface UIHandler {
  /**
   * Initialize the handler with SDK configuration
   * Called by the SDK before any requests are made
   * @param config - SDK configuration the handler may need
   */
  init?(config: UIHandlerConfig): void;

  /**
   * Request user approval for an action
   * @param request - The UI request containing action details
   * @returns Promise resolving to user's response
   * @throws {UIError} If user rejects or request times out
   */
  request<T = unknown>(request: UIRequest): Promise<UIResponse<T>>;

  /**
   * Check if this handler can handle a specific request type
   * @param request - The UI request to check
   * @returns true if this handler can handle the request
   */
  canHandle?(request: UIRequest): boolean;

  /**
   * Optional cleanup when handler is no longer needed
   */
  cleanup?(): Promise<void>;
}

/**
 * Options for UI handler
 */
export interface UIHandlerOptions {
  timeout?: number; // milliseconds
}