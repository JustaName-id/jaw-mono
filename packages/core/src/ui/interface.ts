import { Address } from '../provider/interface.js';

/**
 * UI request types that require user interaction
 */
export type UIRequestType =
  | 'wallet_connect'
  | 'wallet_sendCalls'
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
  };
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
  };
}

/**
 * Permission grant request (wallet_grantPermissions)
 */
export interface PermissionUIRequest extends BaseUIRequest {
  type: 'wallet_grantPermissions';
  data: {
    address: Address;
    chainId: number;
    expiry: number;
    spender: Address;
    permissions: {
      spend: {
        limit: string;
        period: 'day' | 'week' | 'month' | 'year';
        token: Address;
      };
    };
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
  | PermissionUIRequest;

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
 * Platform-agnostic UI handler interface
 *
 * Implement this interface to provide custom UI for app-specific mode.
 * The SDK will call the request method when user approval is needed.
 */
export interface UIHandler {
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