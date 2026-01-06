/**
 * ReactNativeUIHandler
 *
 * React Native implementation of the UIHandler interface for @jaw.id/core.
 * This handler manages modal dialogs for wallet operations in React Native apps.
 *
 * @example
 * ```typescript
 * import { JAW, Mode } from '@jaw.id/core';
 * import { ReactNativeUIHandler, UIHandlerProvider } from '@jaw/ui-native';
 *
 * // Create the handler
 * const uiHandler = new ReactNativeUIHandler();
 *
 * // Create JAW instance
 * const jaw = JAW.create({
 *   apiKey: 'your-api-key',
 *   defaultChainId: 1,
 *   preference: {
 *     mode: Mode.AppSpecific,
 *     uiHandler,
 *   },
 * });
 *
 * // Wrap your app with the provider
 * function App() {
 *   return (
 *     <UIHandlerProvider handler={uiHandler}>
 *       <YourApp />
 *     </UIHandlerProvider>
 *   );
 * }
 * ```
 */

import React, { createContext, useContext, useState, useCallback, useEffect } from 'react';
import type {
  UIHandler,
  UIHandlerConfig,
  UIRequest,
  UIResponse,
  ConnectUIRequest,
  SignatureUIRequest,
  TypedDataUIRequest,
  TransactionUIRequest,
  SendTransactionUIRequest,
  PermissionUIRequest,
  RevokePermissionUIRequest,
  WalletSignUIRequest,
} from '@jaw.id/core';
import {
  OnboardingModalWrapper,
  SignatureModalWrapper,
  SiweModalWrapper,
  Eip712ModalWrapper,
  TransactionModalWrapper,
  PermissionModalWrapper,
  RevokePermissionModalWrapper,
} from './wrappers';

// Import utilities from separate module (breaks require cycles)
import {
  hexToUtf8,
  isSiweMessage,
  getChainNameFromId,
  getChainIconKeyFromId,
  CHAIN_NAMES,
} from './utils';

// Re-export utilities for backward compatibility
export { hexToUtf8, isSiweMessage, getChainNameFromId, getChainIconKeyFromId, CHAIN_NAMES };

// Re-export types for consumers
export type {
  UIHandler,
  UIHandlerConfig,
  UIRequest,
  UIResponse,
  ConnectUIRequest,
  SignatureUIRequest,
  TypedDataUIRequest,
  TransactionUIRequest,
};

// Internal types
interface ModalState {
  type: string;
  request: UIRequest;
  resolve: (response: UIResponse<unknown>) => void;
  reject: (error: Error) => void;
}

interface UIHandlerContextType {
  modalState: ModalState | null;
  showModal: (state: ModalState) => void;
  hideModal: () => void;
  config: UIHandlerConfig | null;
}

const UIHandlerContext = createContext<UIHandlerContextType | null>(null);

/**
 * Hook to access the UI handler context
 */
export function useUIHandler() {
  const context = useContext(UIHandlerContext);
  if (!context) {
    throw new Error('useUIHandler must be used within UIHandlerProvider');
  }
  return context;
}

/**
 * ReactNativeUIHandler Class
 *
 * Implements the UIHandler interface for React Native.
 * Must be used with UIHandlerProvider to render modals.
 */
export class ReactNativeUIHandler implements UIHandler {
  private config: UIHandlerConfig = {} as UIHandlerConfig;
  private showModalFn: ((state: ModalState) => void) | null = null;
  private hideModalFn: (() => void) | null = null;

  /**
   * Initialize the handler with SDK configuration
   * Called automatically by the SDK - do not call directly
   */
  init(config: UIHandlerConfig): void {
    this.config = config;
  }

  /**
   * Get the current configuration
   */
  getConfig(): UIHandlerConfig {
    return this.config;
  }

  /**
   * Register modal show/hide functions from the provider
   * @internal
   */
  _registerModalFunctions(
    showModal: (state: ModalState) => void,
    hideModal: () => void
  ): void {
    this.showModalFn = showModal;
    this.hideModalFn = hideModal;
  }

  /**
   * Unregister modal functions
   * @internal
   */
  _unregisterModalFunctions(): void {
    this.showModalFn = null;
    this.hideModalFn = null;
  }

  /**
   * Handle a UI request
   */
  async request<T = unknown>(request: UIRequest): Promise<UIResponse<T>> {
    if (!this.showModalFn) {
      throw new Error(
        'ReactNativeUIHandler: Modal functions not registered. Make sure to wrap your app with UIHandlerProvider.'
      );
    }

    return new Promise((resolve, reject) => {
      this.showModalFn!({
        type: this.getModalType(request),
        request,
        resolve: resolve as (response: UIResponse<unknown>) => void,
        reject,
      });
    });
  }

  /**
   * Check if this handler can handle a request type
   */
  canHandle(request: UIRequest): boolean {
    return [
      'wallet_connect',
      'personal_sign',
      'eth_signTypedData_v4',
      'wallet_sendCalls',
      'eth_sendTransaction',
      'wallet_grantPermissions',
      'wallet_revokePermissions',
      'wallet_sign',
    ].includes(request.type);
  }

  /**
   * Cleanup any pending modals
   */
  async cleanup(): Promise<void> {
    this.hideModalFn?.();
  }

  /**
   * Get the modal type for a request
   */
  private getModalType(request: UIRequest): string {
    switch (request.type) {
      case 'wallet_connect':
        return 'onboarding';
      case 'personal_sign': {
        const signRequest = request as SignatureUIRequest;
        return isSiweMessage(signRequest.data.message) ? 'siwe' : 'signature';
      }
      case 'wallet_sign': {
        const walletSignRequest = request as WalletSignUIRequest;
        const signType = walletSignRequest.data.request.type;
        if (signType === '0x45') {
          const requestData = walletSignRequest.data.request.data as { message: string };
          return isSiweMessage(requestData.message) ? 'siwe' : 'signature';
        }
        return signType === '0x01' ? 'eip712' : 'unsupported';
      }
      case 'eth_signTypedData_v4':
        return 'eip712';
      case 'wallet_sendCalls':
      case 'eth_sendTransaction':
        return 'transaction';
      case 'wallet_grantPermissions':
      case 'wallet_revokePermissions':
        return 'permission';
      default:
        return 'unsupported';
    }
  }
}

/**
 * UIHandlerProvider Props
 */
interface UIHandlerProviderProps {
  handler: ReactNativeUIHandler;
  children: React.ReactNode;
}

/**
 * UIHandlerProvider
 *
 * Provides the context for ReactNativeUIHandler to render modals.
 * Wrap your app with this provider to enable UI handler functionality.
 */
export function UIHandlerProvider({ handler, children }: UIHandlerProviderProps) {
  const [modalState, setModalState] = useState<ModalState | null>(null);
  const [config, setConfig] = useState<UIHandlerConfig | null>(null);

  const showModal = useCallback((state: ModalState) => {
    setModalState(state);
    setConfig(handler.getConfig());
  }, [handler]);

  const hideModal = useCallback(() => {
    setModalState(null);
  }, []);

  // Register modal functions with the handler
  useEffect(() => {
    handler._registerModalFunctions(showModal, hideModal);
    return () => {
      handler._unregisterModalFunctions();
    };
  }, [handler, showModal, hideModal]);

  const contextValue: UIHandlerContextType = {
    modalState,
    showModal,
    hideModal,
    config,
  };

  return (
    <UIHandlerContext.Provider value={contextValue}>
      {children}
      {/* Modal rendering will be handled by ModalRenderer component */}
    </UIHandlerContext.Provider>
  );
}

/**
 * ModalRenderer
 *
 * Renders the appropriate modal based on the current modal state.
 * Should be placed inside UIHandlerProvider, typically at the root of your app.
 */
export function ModalRenderer() {
  const { modalState, hideModal, config } = useUIHandler();

  if (!modalState || !config) {
    return null;
  }

  const handleApprove = (data: unknown) => {
    modalState.resolve({
      id: modalState.request.id,
      approved: true,
      data,
    });
    hideModal();
  };

  const handleReject = (error?: Error) => {
    modalState.resolve({
      id: modalState.request.id,
      approved: false,
      error: error || { code: 4001, message: 'User rejected the request' },
    });
    hideModal();
  };

  // Render appropriate modal based on type
  switch (modalState.type) {
    case 'onboarding':
      return (
        <OnboardingModalWrapper
          request={modalState.request as ConnectUIRequest}
          config={config}
          onApprove={handleApprove}
          onReject={handleReject}
        />
      );
    case 'signature':
      return (
        <SignatureModalWrapper
          request={modalState.request as SignatureUIRequest}
          config={config}
          onApprove={handleApprove}
          onReject={handleReject}
        />
      );
    case 'siwe':
      return (
        <SiweModalWrapper
          request={modalState.request as SignatureUIRequest}
          config={config}
          onApprove={handleApprove}
          onReject={handleReject}
        />
      );
    case 'eip712':
      return (
        <Eip712ModalWrapper
          request={modalState.request as TypedDataUIRequest}
          config={config}
          onApprove={handleApprove}
          onReject={handleReject}
        />
      );
    case 'transaction':
      return (
        <TransactionModalWrapper
          request={modalState.request as TransactionUIRequest | SendTransactionUIRequest}
          config={config}
          onApprove={handleApprove}
          onReject={handleReject}
        />
      );
    case 'permission':
      // Check if this is a revoke or grant permission request
      if (modalState.request.type === 'wallet_revokePermissions') {
        return (
          <RevokePermissionModalWrapper
            request={modalState.request as RevokePermissionUIRequest}
            config={config}
            onApprove={handleApprove}
            onReject={handleReject}
          />
        );
      }
      return (
        <PermissionModalWrapper
          request={modalState.request as PermissionUIRequest}
          config={config}
          onApprove={handleApprove}
          onReject={handleReject}
        />
      );
    default:
      console.warn(`Unknown modal type: ${modalState.type}`);
      return null;
  }
}

