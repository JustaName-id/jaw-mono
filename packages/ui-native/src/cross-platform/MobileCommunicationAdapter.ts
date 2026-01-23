/**
 * MobileCommunicationAdapter
 *
 * Implements CommunicationAdapter for React Native using deep links.
 * Uses expo-web-browser which opens:
 * - iOS: Safari View Controller (SVC)
 * - Android: Chrome Custom Tab (CCT)
 *
 * These are real browser sessions that fully support WebAuthn,
 * unlike embedded WebViews which block passkey operations.
 *
 * WHY DEEP LINKS INSTEAD OF WEBVIEW?
 *
 * Research shows deep links with Safari VC / Chrome Custom Tab are superior:
 *
 * 1. WebAuthn Reliability: 100% support vs iOS 14.5+ / Android varies
 * 2. Security: Isolated browser process vs embedded (same security context)
 * 3. Credential Access: Full system keychain vs app-constrained
 * 4. UX: Native browser feel vs potentially cramped
 * 5. Future-Proof: Browser updates automatic vs app updates required
 *
 * WebView was considered but rejected due to WebAuthn limitations.
 *
 * Flow:
 * 1. Encode RPC request message in URL params
 * 2. Open keys.jaw.id in Safari/Chrome with config + request
 * 3. User completes passkey authentication in browser
 * 4. Browser redirects to app via deep link with response
 * 5. App parses response and resolves promise
 */

import * as WebBrowser from 'expo-web-browser';
import * as Linking from 'expo-linking';
import type { CommunicationAdapter } from '@jaw.id/core';
import { Message, MessageID, RPCResponseMessage, RPCResponse } from '@jaw.id/core';

// SDK version - should match core package
const SDK_VERSION = '1.0.0';

export interface MobileCommunicationConfig {
  apiKey: string;
  appName: string;
  appLogoUrl?: string;
  defaultChainId?: number;
  keysUrl: string;
  showTestnets?: boolean;
}

/**
 * MobileCommunicationAdapter class
 *
 * Handles RPC communication via Safari View Controller / Chrome Custom Tab.
 * WebAuthn/passkeys work in these real browser contexts.
 */
export class MobileCommunicationAdapter implements CommunicationAdapter {
  private config: MobileCommunicationConfig | null = null;
  private callbackUrl: string | null = null;
  private pendingRequests = new Map<MessageID, {
    resolve: (value: unknown) => void;
    reject: (error: Error) => void;
  }>();
  private messageListeners = new Map<string, (message: unknown) => void>();
  private linkingSubscription: ReturnType<typeof Linking.addEventListener> | null = null;
  private isReady = false;
  private credentialId: string | null = null; // Store credentialId from connection

  constructor() {
    // Empty - config set via init()
  }

  /**
   * Generate a unique message ID (UUID).
   */
  private generateMessageId(): MessageID {
    return crypto.randomUUID() as MessageID;
  }

  /**
   * Initialize the adapter with configuration.
   * Must be called before any other methods.
   */
  init(config: MobileCommunicationConfig): void {
    if (this.config) {
      throw new Error('[MobileCommunicationAdapter] Already initialized');
    }
    this.config = config;
    // Generate callback URL using app's scheme
    // This creates a URL like: jaw-demo://auth
    this.callbackUrl = Linking.createURL('auth');
  }

  /**
   * Initialize and wait for the communication channel to be ready.
   * For mobile: Sets up deep link listeners.
   */
  async waitForReady(): Promise<void> {
    if (!this.config) {
      throw new Error(
        '[MobileCommunicationAdapter] Not initialized. ' +
        'Must call init() with config before use.'
      );
    }

    if (this.isReady) {
      return;
    }

    console.log('[MobileCommunicationAdapter] Setting up deep link listener...');

    // Set up deep link listener if not already done
    if (!this.linkingSubscription) {
      this.linkingSubscription = Linking.addEventListener('url', this.handleDeepLink.bind(this));
      console.log('[MobileCommunicationAdapter] Deep link listener registered');
    }

    // Check if there's an initial URL (app was opened via deep link)
    try {
      const initialUrl = await Linking.getInitialURL();
      if (initialUrl) {
        console.log('[MobileCommunicationAdapter] Found initial URL:', initialUrl);
        this.handleDeepLink({ url: initialUrl });
      }
    } catch (error) {
      console.warn('[MobileCommunicationAdapter] Failed to get initial URL:', error);
    }

    this.isReady = true;
  }

  /**
   * Send a request and wait for a response.
   * Opens browser with request encoded in URL, waits for deep link callback.
   */
  async postRequestAndWaitForResponse<M extends Message>(
    request: Message & { id: MessageID }
  ): Promise<M> {
    await this.waitForReady();

    return new Promise((resolve, reject) => {
      // Store the pending request
      this.pendingRequests.set(request.id, { resolve, reject });

      // Build URL with request
      const url = this.buildRequestUrl(request);

      // Open browser (callbackUrl guaranteed to exist after waitForReady)
      WebBrowser.openAuthSessionAsync(url, this.callbackUrl!, {
        showInRecents: true,
        // Don't use ephemeral session - we want passkeys to persist
        preferEphemeralSession: false,
      }).then((result) => {
        console.log('[MobileCommunicationAdapter] Browser session result:', result);

        // Handle browser session result
        if (result.type === 'cancel' || result.type === 'dismiss') {
          this.pendingRequests.delete(request.id);
          reject(new Error('User cancelled authentication'));
          return;
        }

        // On iOS Safari View Controller, deep links don't always fire
        // So we need to check if the result contains the URL with response data
        if (result.type === 'success' && result.url) {
          console.log('[MobileCommunicationAdapter] Browser returned with URL:', result.url);
          // Manually trigger deep link handler with the returned URL
          this.handleDeepLink({ url: result.url });
        }

        // Note: For cases where deep link fires separately, that's handled by the listener
      }).catch((error) => {
        console.error('[MobileCommunicationAdapter] Browser session error:', error);
        this.pendingRequests.delete(request.id);
        reject(error);
      });
    });
  }

  /**
   * Post a message without waiting for response.
   * For mobile, this is used for fire-and-forget messages.
   */
  async postMessage(message: Message): Promise<void> {
    await this.waitForReady();

    const url = this.buildRequestUrl(message);
    await WebBrowser.openAuthSessionAsync(url, this.callbackUrl!, {
      showInRecents: true,
      preferEphemeralSession: false,
    });
  }

  /**
   * Listen for messages matching a predicate.
   * Returns a promise that resolves when a matching message arrives.
   */
  async onMessage<M extends Message>(
    predicate: (msg: Partial<M>) => boolean
  ): Promise<M> {
    await this.waitForReady();

    return new Promise((resolve, reject) => {
      const listenerId = crypto.randomUUID();

      const listener = (message: unknown) => {
        if (predicate(message as Partial<M>)) {
          this.messageListeners.delete(listenerId);
          resolve(message as M);
        }
      };

      this.messageListeners.set(listenerId, listener);
    });
  }

  /**
   * Cleanup all resources.
   * Removes deep link listeners and clears pending requests.
   */
  disconnect(): void {
    if (this.linkingSubscription) {
      this.linkingSubscription.remove();
      this.linkingSubscription = null;
    }

    // Reject all pending requests
    this.pendingRequests.forEach(({ reject }) => {
      reject(new Error('Communication adapter disconnected'));
    });
    this.pendingRequests.clear();
    this.messageListeners.clear();
    this.credentialId = null; // Clear stored credential
    this.isReady = false;
  }

  /**
   * Handle deep link callback from browser
   */
  private handleDeepLink(event: { url: string }): void {
    try {
      const parsed = Linking.parse(event.url);
      const queryParams = parsed.queryParams || {};

      console.log('[MobileCommunicationAdapter] Deep link received:', event.url);
      console.log('[MobileCommunicationAdapter] Query params:', queryParams);

      // Check for error
      if (queryParams.error) {
        const errorMsg = String(queryParams.error);
        console.log('[MobileCommunicationAdapter] Error in deep link:', errorMsg);
        // Reject all pending requests with this error
        this.pendingRequests.forEach(({ reject }) => {
          reject(new Error(errorMsg));
        });
        this.pendingRequests.clear();
        return;
      }

      // Check for response OR result (keys.jaw.id uses 'result')
      const responseParam = queryParams.response || queryParams.result;
      if (responseParam) {
        const responseStr = String(responseParam);
        const rawResponse = JSON.parse(this.base64Decode(responseStr));

        console.log('[MobileCommunicationAdapter] Decoded response:', rawResponse);

        // Resolve pending request
        // For browser mode, keys.jaw.id doesn't include requestId in the response
        // So we resolve the first (and should be only) pending request
        if (this.pendingRequests.size > 0) {
          const [firstRequestId, firstRequest] = Array.from(this.pendingRequests.entries())[0];
          console.log('[MobileCommunicationAdapter] Resolving request:', firstRequestId);

          // Transform browser mode response to expected RPC message format
          // Different methods return different response formats
          let rpcResponse: RPCResponse;

          if (rawResponse.address) {
            // Connect response: { address, username, credentialId, chainId }
            // Store credentialId for future requests
            if (rawResponse.credentialId) {
              this.credentialId = rawResponse.credentialId;
              console.log('[MobileCommunicationAdapter] Stored credentialId:', this.credentialId);
            }

            // eth_requestAccounts expects result.value to be Address[]
            rpcResponse = {
              result: {
                value: [rawResponse.address],
              },
            };
          } else if (rawResponse.signature) {
            // Sign response: { signature: '0x...' }
            // personal_sign expects result.value to be the signature string
            rpcResponse = {
              result: {
                value: rawResponse.signature,
              },
            };
          } else if (rawResponse.txHash || rawResponse.id) {
            // Transaction response: { txHash, id, chainId }
            // wallet_sendCalls expects { id, chainId }
            rpcResponse = {
              result: {
                value: {
                  id: rawResponse.id || rawResponse.txHash,
                  chainId: rawResponse.chainId,
                },
              },
            };
          } else if (rawResponse.permissionId) {
            // Permission response: { permissionId, expiry, account, spender, chainId }
            rpcResponse = {
              result: {
                value: rawResponse,
              },
            };
          } else {
            // Generic response - pass through as-is
            rpcResponse = {
              result: {
                value: rawResponse,
              },
            };
          }

          console.log('[MobileCommunicationAdapter] Created RPC response:', rpcResponse);

          // Wrap in RPCResponseMessage format with unencrypted content
          // This matches the format used by WebCommunicationAdapter (which uses encrypted content)
          const responseMessage: RPCResponseMessage = {
            id: this.generateMessageId(),
            requestId: firstRequestId,
            sender: '', // Not used in browser mode (no encryption)
            content: {
              unencrypted: rpcResponse,
            },
            timestamp: new Date(),
          };

          // Notify message listeners
          this.messageListeners.forEach((listener) => {
            listener(responseMessage);
          });

          // Resolve with the RPCResponseMessage (matches WebCommunicationAdapter return type)
          firstRequest.resolve(responseMessage);
          this.pendingRequests.delete(firstRequestId);
        } else {
          console.warn('[MobileCommunicationAdapter] No pending requests to resolve');
        }
      } else {
        console.warn('[MobileCommunicationAdapter] No response or result in deep link');
      }
    } catch (error) {
      console.error('[MobileCommunicationAdapter] Deep link parse error:', error);
      // Reject all pending requests
      this.pendingRequests.forEach(({ reject }) => {
        reject(new Error('Failed to parse deep link response'));
      });
      this.pendingRequests.clear();
    }
  }

  /**
   * Build the request URL with config and request encoded in params
   */
  private buildRequestUrl(request: Message): string {
    // Config is guaranteed to exist after waitForReady() check
    const config = this.config!;
    const callbackUrl = this.callbackUrl!;

    const configData = {
      version: SDK_VERSION,
      metadata: {
        appName: config.appName,
        appLogoUrl: config.appLogoUrl,
        defaultChainId: config.defaultChainId,
      },
      preference: {
        keysUrl: config.keysUrl,
        showTestnets: config.showTestnets,
      },
      apiKey: config.apiKey,
      location: 'react-native-browser',
    };

    // Extract method from request (it's in the handshake field for browser mode)
    const requestData = request as any;
    const method = requestData.content?.handshake?.method || 'eth_requestAccounts';
    const requestParams = requestData.content?.handshake?.params || [];
    const chain = requestData.content?.chain;

    console.log('[MobileCommunicationAdapter] Request method:', method);
    console.log('[MobileCommunicationAdapter] Request params:', requestParams);
    console.log('[MobileCommunicationAdapter] Request chain:', chain);

    // Determine action type for keys.jaw.id
    let action = 'connect';
    const urlParams: Record<string, string> = {
      callback: callbackUrl,
      mode: 'browser',
      config: this.base64Encode(JSON.stringify(configData)),
    };

    // Add chain object to URL params if available
    // keys.jaw.id needs the full chain config, not just chainId
    if (chain) {
      urlParams.chain = this.base64Encode(JSON.stringify(chain));
    }

    // Map method to action and add necessary params
    if (method === 'eth_requestAccounts' || method === 'wallet_connect') {
      action = 'connect';
    } else if (method === 'personal_sign') {
      action = 'signMessage';
      // params[0] is message (hex), params[1] is address
      urlParams.message = this.base64Encode(requestParams[0]);
      // Include credentialId from stored connection
      if (this.credentialId) {
        urlParams.credentialId = this.credentialId;
      }
    } else if (method === 'eth_signTypedData_v4') {
      action = 'signTypedData';
      urlParams.typedData = this.base64Encode(requestParams[1]); // params[1] is typed data JSON
      if (this.credentialId) {
        urlParams.credentialId = this.credentialId;
      }
    } else if (method === 'wallet_sendCalls' || method === 'eth_sendTransaction') {
      action = 'sendTransaction';
      const tx = method === 'wallet_sendCalls' ? requestParams[0]?.calls?.[0] : requestParams[0];
      urlParams.tx = this.base64Encode(JSON.stringify(tx));
      if (this.credentialId) {
        urlParams.credentialId = this.credentialId;
      }
    } else if (method === 'wallet_grantPermissions') {
      action = 'grantPermissions';
      urlParams.permissions = this.base64Encode(JSON.stringify(requestParams[0]));
      if (this.credentialId) {
        urlParams.credentialId = this.credentialId;
      }
    }

    urlParams.action = action;

    const params = new URLSearchParams(urlParams);
    const url = `${config.keysUrl}?${params.toString()}`;

    console.log('[MobileCommunicationAdapter] Opening URL:', url);
    console.log('[MobileCommunicationAdapter] Callback URL:', callbackUrl);

    return url;
  }

  /**
   * Base64 encode (works in React Native)
   */
  private base64Encode(str: string): string {
    // Use global btoa if available, otherwise use Buffer
    if (typeof btoa !== 'undefined') {
      return btoa(str);
    }
    // Fallback for React Native
    return Buffer.from(str, 'utf-8').toString('base64');
  }

  /**
   * Base64 decode (works in React Native)
   */
  private base64Decode(str: string): string {
    // Use global atob if available, otherwise use Buffer
    if (typeof atob !== 'undefined') {
      return atob(str);
    }
    // Fallback for React Native
    return Buffer.from(str, 'base64').toString('utf-8');
  }

  /**
   * Warm up the browser for faster opening
   * Call this early in the app lifecycle if possible
   */
  static async warmUp(): Promise<void> {
    try {
      await WebBrowser.warmUpAsync();
    } catch {
      // Warm up is optional, ignore errors
    }
  }

  /**
   * Cool down the browser when done
   * Call this when the component unmounts
   */
  static async coolDown(): Promise<void> {
    try {
      await WebBrowser.coolDownAsync();
    } catch {
      // Cool down is optional, ignore errors
    }
  }
}

export default MobileCommunicationAdapter;
