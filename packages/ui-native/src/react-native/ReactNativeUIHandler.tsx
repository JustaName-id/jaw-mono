/**
 * ReactNativeUIHandler
 *
 * React Native implementation of the UIHandler interface for @jaw.id/core.
 * This handler manages modal dialogs for wallet operations in React Native apps.
 *
 * @example
 * ```typescript
 * import { JAW, Mode } from '@jaw.id/core';
 * import { ReactNativeUIHandler, JAWModalRoot } from '@jaw/ui-native';
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
 * // Place JAWModalRoot as a sibling at your root -- no wrapping needed:
 * function App() {
 *   return (
 *     <>
 *       <YourApp />
 *       <JAWModalRoot />
 *     </>
 *   );
 * }
 * ```
 */

import type {
  UIHandler,
  UIHandlerConfig,
  UIRequest,
  UIResponse,
  ConnectUIRequest,
  SignatureUIRequest,
  TypedDataUIRequest,
  TransactionUIRequest,
  WalletSignUIRequest,
} from "@jaw.id/core";

import { registerConfigGetter, showModal, hideModal } from "./modalBridge";

// Import utilities from separate module (breaks require cycles)
import {
  hexToUtf8,
  isSiweMessage,
  getChainNameFromId,
  getChainIconKeyFromId,
  CHAIN_NAMES,
} from "./utils";

// Re-export utilities for backward compatibility
export {
  hexToUtf8,
  isSiweMessage,
  getChainNameFromId,
  getChainIconKeyFromId,
  CHAIN_NAMES,
};

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

/**
 * ReactNativeUIHandler Class
 *
 * Implements the UIHandler interface for React Native.
 * Use with <JAWModalRoot /> placed at your app root to render modals.
 */
export class ReactNativeUIHandler implements UIHandler {
  private config: UIHandlerConfig = {} as UIHandlerConfig;

  /**
   * Initialize the handler with SDK configuration.
   * Called automatically by the SDK -- do not call directly.
   */
  init(config: UIHandlerConfig): void {
    this.config = config;
    registerConfigGetter(() => this.config);
  }

  /**
   * Get the current configuration.
   */
  getConfig(): UIHandlerConfig {
    return this.config;
  }

  /**
   * Handle a UI request by showing a modal via the bridge.
   */
  async request<T = unknown>(request: UIRequest): Promise<UIResponse<T>> {
    return new Promise((resolve, reject) => {
      showModal({
        type: this.getModalType(request),
        request,
        resolve: resolve as (response: UIResponse<unknown>) => void,
        reject,
      });
    });
  }

  /**
   * Check if this handler can handle a request type.
   */
  canHandle(request: UIRequest): boolean {
    return [
      "wallet_connect",
      "personal_sign",
      "eth_signTypedData_v4",
      "wallet_sendCalls",
      "eth_sendTransaction",
      "wallet_grantPermissions",
      "wallet_revokePermissions",
      "wallet_sign",
    ].includes(request.type);
  }

  /**
   * Cleanup any pending modals.
   */
  async cleanup(): Promise<void> {
    hideModal();
  }

  /**
   * Get the modal type for a request.
   */
  private getModalType(request: UIRequest): string {
    switch (request.type) {
      case "wallet_connect":
        return "onboarding";
      case "personal_sign": {
        const signRequest = request as SignatureUIRequest;
        return isSiweMessage(signRequest.data.message) ? "siwe" : "signature";
      }
      case "wallet_sign": {
        // ERC-7871 wallet_sign support
        const walletSignRequest = request as WalletSignUIRequest;
        const signType = walletSignRequest.data.request.type;

        if (signType === "0x45") {
          // ERC-7871 PersonalSign - data is { message: string }
          const requestData = walletSignRequest.data.request.data as {
            message: string;
          };
          const message = requestData.message;
          return isSiweMessage(message) ? "siwe" : "signature";
        } else if (signType === "0x01") {
          // ERC-7871 TypedData
          return "eip712";
        } else {
          // Unsupported sign type
          console.warn(
            `[ReactNativeUIHandler] Unsupported wallet_sign type: ${signType}`,
          );
          return "unsupported";
        }
      }
      case "eth_signTypedData_v4":
        return "eip712";
      case "wallet_sendCalls":
      case "eth_sendTransaction":
        return "transaction";
      case "wallet_grantPermissions":
      case "wallet_revokePermissions":
        return "permission";
      default:
        return "unsupported";
    }
  }
}
