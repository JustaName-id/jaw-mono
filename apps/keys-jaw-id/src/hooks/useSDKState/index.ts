/**
 * useSDKState Hook
 * Manages explicit state machine for SDK popup flow
 */

import { useState, useCallback } from 'react';

/**
 * Explicit states for SDK popup flow
 *
 * Flow:
 * initializing → connecting → passkey-check →
 * → [passkey-create | passkey-auth | account-selection] →
 * → request-approval → processing → [success | error]
 */
export type SDKPopupState =
  | 'initializing'     // Initial load, checking URL params
  | 'connecting'       // Sending PopupLoaded, waiting for config
  | 'passkey-check'    // Checking for existing passkeys
  | 'passkey-create'   // User needs to create a passkey
  | 'passkey-auth'     // User needs to authenticate with existing passkey
  | 'account-selection'// User authenticated, showing connection approval
  | 'request-approval' // Showing request approval UI (sign, tx, etc.)
  | 'processing'       // Processing user action
  | 'success'          // Action completed successfully
  | 'error';           // Error occurred

export interface UseSDKStateReturn {
  /**
   * Current state of the popup
   */
  state: SDKPopupState;

  /**
   * Set the current state
   */
  setState: (state: SDKPopupState) => void;

  /**
   * Current error message (if state is 'error')
   */
  error: string | null;

  /**
   * Set an error and transition to 'error' state
   */
  setError: (error: string) => void;

  /**
   * Clear error and return to a previous state
   */
  clearError: (returnState?: SDKPopupState) => void;

  /**
   * Whether the popup is in a loading state
   */
  isLoading: boolean;

  /**
   * Whether the popup is in an error state
   */
  isError: boolean;

  /**
   * Whether the popup has completed successfully
   */
  isSuccess: boolean;
}

/**
 * Hook for managing SDK popup state machine
 */
export function useSDKState(initialState: SDKPopupState = 'initializing'): UseSDKStateReturn {
  const [state, setState] = useState<SDKPopupState>(initialState);
  const [error, setErrorMessage] = useState<string | null>(null);

  const setError = useCallback((errorMsg: string) => {
    console.error('❌ SDK Error:', errorMsg);
    setErrorMessage(errorMsg);
    setState('error');
  }, []);

  const clearError = useCallback((returnState: SDKPopupState = 'passkey-check') => {
    console.log('🔄 Clearing error, returning to:', returnState);
    setErrorMessage(null);
    setState(returnState);
  }, []);

  const isLoading = state === 'initializing'
    || state === 'connecting'
    || state === 'passkey-check'
    || state === 'processing';

  const isError = state === 'error';
  const isSuccess = state === 'success';

  return {
    state,
    setState,
    error,
    setError,
    clearError,
    isLoading,
    isError,
    isSuccess,
  };
}
