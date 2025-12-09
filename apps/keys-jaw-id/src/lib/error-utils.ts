/**
 * Error utilities for keys-jaw-id app
 *
 * Provides helpers for creating and extracting standardized Ethereum RPC errors
 * following EIP-1193 (Provider Errors) and JSON-RPC 2.0 / EIP-1474 standards.
 */

import { standardErrors, standardErrorCodes, getErrorCode } from '@jaw.id/core';

/**
 * Standard error codes reference:
 *
 * Provider Errors (EIP-1193):
 * - 4001: userRejectedRequest - User rejected the request
 * - 4100: unauthorized - Requested method/account not authorized
 * - 4200: unsupportedMethod - Provider does not support the method
 * - 4900: disconnected - Provider is disconnected from all chains
 * - 4901: chainDisconnected - Provider is disconnected from specified chain
 *
 * RPC Errors (JSON-RPC 2.0 / EIP-1474):
 * - -32700: parse - Invalid JSON
 * - -32600: invalidRequest - Invalid Request object
 * - -32601: methodNotFound - Method does not exist
 * - -32602: invalidParams - Invalid method parameters
 * - -32603: internal - Internal JSON-RPC error
 * - -32000: invalidInput - Invalid input
 * - -32001: resourceNotFound - Resource not found
 * - -32002: resourceUnavailable - Resource unavailable
 * - -32003: transactionRejected - Transaction rejected
 * - -32004: methodNotSupported - Method not supported
 * - -32005: limitExceeded - Request limit exceeded
 */

export { standardErrors, standardErrorCodes, getErrorCode };

/**
 * Extract the error code from any error object
 * Falls back to a default code if no code is found
 *
 * @param error - The error to extract code from
 * @param defaultCode - Default code if none found (defaults to 4001 - user rejected)
 * @returns The error code
 */
export function extractErrorCode(error: unknown, defaultCode: number = standardErrorCodes.provider.userRejectedRequest): number {
  const code = getErrorCode(error);
  return code ?? defaultCode;
}

/**
 * Create a user rejection error (EIP-1193 code 4001)
 * Use when user explicitly cancels/rejects a request
 */
export function createUserRejectedError(message: string = 'User rejected the request'): Error {
  return standardErrors.provider.userRejectedRequest({ message });
}

/**
 * Create an internal error (JSON-RPC code -32603)
 * Use for unexpected internal failures (initialization errors, crypto errors, etc.)
 */
export function createInternalError(message: string): Error {
  return standardErrors.rpc.internal({ message });
}

/**
 * Create an invalid params error (JSON-RPC code -32602)
 * Use when request parameters are invalid or missing
 */
export function createInvalidParamsError(message: string): Error {
  return standardErrors.rpc.invalidParams({ message });
}

/**
 * Create an invalid input error (EIP-1474 code -32000)
 * Use when input data is malformed or invalid
 */
export function createInvalidInputError(message: string): Error {
  return standardErrors.rpc.invalidInput({ message });
}

/**
 * Create a transaction rejected error (EIP-1474 code -32003)
 * Use when a transaction is rejected (e.g., insufficient funds, gas issues)
 */
export function createTransactionRejectedError(message: string): Error {
  return standardErrors.rpc.transactionRejected({ message });
}

/**
 * Create a method not found error (JSON-RPC code -32601)
 * Use when the requested method is not supported
 */
export function createMethodNotFoundError(method: string): Error {
  return standardErrors.rpc.methodNotFound({ message: `Method not supported: ${method}` });
}

/**
 * Create a resource not found error (EIP-1474 code -32001)
 * Use when a requested resource (like a call status) is not found
 */
export function createResourceNotFoundError(message: string): Error {
  return standardErrors.rpc.resourceNotFound({ message });
}

/**
 * Known passkey/WebAuthn error class names from @jaw.id/core
 */
const PASSKEY_ERROR_NAMES = [
  'WebAuthnAuthenticationError',
  'PasskeyRegistrationError',
  'PasskeyLookupError',
] as const;

/**
 * Check if error is a user cancellation from WebAuthn/Passkey API
 *
 * The WebAuthn API throws DOMException with name 'NotAllowedError' when:
 * - User clicks "Cancel" on the passkey prompt
 * - User dismisses the passkey dialog
 * - The operation times out waiting for user interaction
 */
function isWebAuthnUserCancellation(error: unknown): boolean {
  if (!(error instanceof Error)) return false;

  // DOMException with NotAllowedError = user cancelled passkey prompt
  // Check by name since DOMException might not be available in all environments
  return error.name === 'NotAllowedError';
}

/**
 * Check if error is a passkey-specific error from @jaw.id/core
 */
function isPasskeyError(error: unknown): error is Error {
  if (!(error instanceof Error)) return false;
  return PASSKEY_ERROR_NAMES.includes(error.name as typeof PASSKEY_ERROR_NAMES[number]);
}

/**
 * Categorize an unknown error and ensure it has a proper error code.
 *
 * Error categorization priority:
 * 1. Already has a code → return as-is
 * 2. WebAuthn NotAllowedError (DOMException) → 4001 (user rejected)
 * 3. Passkey errors (WebAuthnAuthenticationError, etc.) → -32603 (internal)
 * 4. Transaction errors (insufficient funds, gas) → -32003 (transaction rejected)
 * 5. Everything else → -32603 (internal)
 *
 * @param error - The error to categorize
 * @returns An error with a proper code attached
 */
export function categorizeError(error: unknown): Error {
  // 1. If error already has a valid code, return as-is
  const existingCode = getErrorCode(error);
  if (existingCode !== undefined) {
    return error as Error;
  }

  // 2. WebAuthn user cancellation (DOMException NotAllowedError)
  if (isWebAuthnUserCancellation(error)) {
    return createUserRejectedError('User cancelled the passkey authentication');
  }

  // 3. Passkey-specific errors from @jaw.id/core
  if (isPasskeyError(error)) {
    // All passkey errors are internal errors (auth failed, lookup failed, etc.)
    return createInternalError(error.message);
  }

  // Extract message for remaining checks
  const message = error instanceof Error
    ? error.message
    : typeof error === 'string'
      ? error
      : 'An unknown error occurred';

  // 4. Transaction-related errors (check specific patterns)
  const lowerMessage = message.toLowerCase();

  if (lowerMessage.includes('insufficient') ||
      lowerMessage.includes('aa21') ||
      lowerMessage.includes("didn't pay prefund") ||
      lowerMessage.includes('gas required exceeds') ||
      lowerMessage.includes('exceeds balance')) {
    return createTransactionRejectedError(message);
  }

  // 5. Default: internal error
  // All other unknown errors are categorized as internal errors (-32603)
  // This is the safest default as it indicates something unexpected happened
  return createInternalError(message);
}
