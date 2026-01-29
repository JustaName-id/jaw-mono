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
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { CommunicationAdapter } from '@jaw.id/core';
import { Message, MessageID, RPCResponseMessage, RPCResponse, RPCRequestMessage } from '@jaw.id/core';

// SDK version - should match core package
const SDK_VERSION = '1.0.0';

// AsyncStorage key for persisting credentialId
const CREDENTIAL_ID_KEY = 'JAW_CREDENTIAL_ID';

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

    // Load persisted credentialId asynchronously (don't block initialization)
    AsyncStorage.getItem(CREDENTIAL_ID_KEY).then(credentialId => {
      if (credentialId) {
        this.credentialId = credentialId;
      }
    }).catch(error => {
      console.warn('[MobileCommunicationAdapter] Failed to load credentialId:', error);
    });
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

    // Set up deep link listener if not already done
    if (!this.linkingSubscription) {
      this.linkingSubscription = Linking.addEventListener('url', this.handleDeepLink.bind(this));
    }

    // Check if there's an initial URL (app was opened via deep link)
    try {
      const initialUrl = await Linking.getInitialURL();
      if (initialUrl) {
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
        // Handle browser session result
        if (result.type === 'cancel' || result.type === 'dismiss') {
          this.pendingRequests.delete(request.id);
          reject(new Error('User cancelled authentication'));
          return;
        }

        // On iOS Safari View Controller, deep links don't always fire
        // So we need to check if the result contains the URL with response data
        if (result.type === 'success' && result.url) {
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

    return new Promise((resolve, _reject) => {
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

    // Clear stored credential (both memory and storage)
    this.credentialId = null;
    AsyncStorage.removeItem(CREDENTIAL_ID_KEY).catch(error => {
      console.warn('[MobileCommunicationAdapter] Failed to clear credentialId:', error);
    });

    this.isReady = false;
  }

  /**
   * Handle deep link callback from browser
   */
  private handleDeepLink(event: { url: string }): void {
    try {
      const parsed = Linking.parse(event.url);
      const queryParams = parsed.queryParams || {};

      // Check for error
      if (queryParams.error) {
        const errorMsg = String(queryParams.error);
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

        let rawResponse;
        try {
          // iOS URL handling encodes query params, need to URL decode first
          const decodedResponseStr = decodeURIComponent(responseStr);
          const decoded = this.base64Decode(decodedResponseStr);
          rawResponse = JSON.parse(decoded);
        } catch (decodeError) {
          console.error('[MobileCommunicationAdapter] Failed to decode response:', decodeError);

          // Reject all pending requests with decode error
          this.pendingRequests.forEach(({ reject }) => {
            reject(new Error(`Failed to decode response: ${decodeError instanceof Error ? decodeError.message : String(decodeError)}`));
          });
          this.pendingRequests.clear();
          return;
        }

        // Resolve pending request - match by requestId if available
        const requestIdParam = queryParams.requestId as MessageID | undefined;

        let matchedRequestId: MessageID | undefined;
        let matchedRequest: { resolve: (value: unknown) => void; reject: (error: Error) => void } | undefined;

        if (requestIdParam && this.pendingRequests.has(requestIdParam)) {
          // Match by requestId (correct correlation)
          matchedRequestId = requestIdParam;
          matchedRequest = this.pendingRequests.get(requestIdParam);
        } else if (this.pendingRequests.size === 1) {
          // Fallback: only one pending request, use it
          [matchedRequestId, matchedRequest] = Array.from(this.pendingRequests.entries())[0];
        } else if (this.pendingRequests.size > 1) {
          // Multiple pending requests but no match = error
          this.pendingRequests.forEach(({ reject }) => {
            reject(new Error('Request correlation failed: multiple pending requests'));
          });
          this.pendingRequests.clear();
          return;
        }

        if (matchedRequest && matchedRequestId) {
          // Transform browser mode response to expected RPC message format
          // Different methods return different response formats
          let rpcResponse: RPCResponse;

          if (rawResponse.address) {
            // Connect response: { address, username, credentialId, chainId }
            // Store credentialId for future requests
            if (rawResponse.credentialId) {
              this.credentialId = rawResponse.credentialId;

              // Persist to AsyncStorage
              AsyncStorage.setItem(CREDENTIAL_ID_KEY, this.credentialId).catch(error => {
                console.warn('[MobileCommunicationAdapter] Failed to persist credentialId:', error);
              });
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

          // Wrap in RPCResponseMessage format with unencrypted content
          // This matches the format used by WebCommunicationAdapter (which uses encrypted content)
          const responseMessage: RPCResponseMessage = {
            id: this.generateMessageId(),
            requestId: matchedRequestId,
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
          matchedRequest.resolve(responseMessage);
          this.pendingRequests.delete(matchedRequestId);
        }
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
      // API key removed - now embedded in chain.rpcUrl (see below)
      location: 'react-native-browser',
    };

    // Extract method from request (it's in the handshake field for browser mode)
    const requestData = request as RPCRequestMessage;
    const method = ('handshake' in requestData.content ? requestData.content.handshake.method : 'eth_requestAccounts');
    const requestParams = ('handshake' in requestData.content ? requestData.content.handshake.params : []);
    const chain = ('handshake' in requestData.content ? requestData.content.chain : undefined);

    // Determine action type for keys.jaw.id
    let action = 'connect';
    const urlParams: Record<string, string> = {
      callback: callbackUrl,
      mode: 'browser',
      config: this.base64Encode(JSON.stringify(configData)),
      requestId: request.id, // Include requestId for correlation
    };

    // Add chain object to URL params if available
    // keys.jaw.id needs the full chain config, not just chainId
    // IMPORTANT: Embed API key in chain.rpcUrl (not in URL params) for security
    // CRITICAL: Always send chain for browser mode (even for connect) to pass API key
    let chainToSend = chain;

    // If no chain in request, create a minimal chain with just chainId and API key
    if (!chainToSend) {
      const chainId = config.defaultChainId || 1;
      chainToSend = { id: chainId };
    }

    // Clone chain to avoid modifying original
    const chainWithApiKey = { ...chainToSend };

    // Ensure API key is embedded in RPC URL
    if (config.apiKey) {
      // Build RPC URL with API key if not already present
      if (!chainWithApiKey.rpcUrl) {
        // No RPC URL yet - create one with API key
        chainWithApiKey.rpcUrl = `https://api.justaname.id/proxy/v1/rpc?chainId=${chainWithApiKey.id}&api-key=${config.apiKey}`;
      } else if (!chainWithApiKey.rpcUrl.includes('api-key=')) {
        // RPC URL exists but no API key - add it
        const separator = chainWithApiKey.rpcUrl.includes('?') ? '&' : '?';
        chainWithApiKey.rpcUrl = `${chainWithApiKey.rpcUrl}${separator}api-key=${config.apiKey}`;
      }
    }

    // Always send chain (critical for API key extraction in browser mode)
    urlParams.chain = this.base64Encode(JSON.stringify(chainWithApiKey));

    // Include app origin for session management
    // Use callback URL scheme as stable app identifier (e.g., "jaw-demo://")
    const callbackScheme = callbackUrl.split('://')[0];
    urlParams.origin = `${callbackScheme}://`;

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
    } else if (method === 'wallet_sendCalls') {
      action = 'sendTransaction';
      // Send all calls, not just the first one
      const calls = requestParams[0]?.calls || [];
      urlParams.calls = this.base64Encode(JSON.stringify(calls));
      if (this.credentialId) {
        urlParams.credentialId = this.credentialId;
      }
    } else if (method === 'eth_sendTransaction') {
      action = 'sendTransaction';
      const tx = requestParams[0];
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
    } else if (method === 'wallet_revokePermissions') {
      action = 'revokePermissions';
      urlParams.permissions = this.base64Encode(JSON.stringify(requestParams[0]));
      if (this.credentialId) {
        urlParams.credentialId = this.credentialId;
      }
    }

    urlParams.action = action;

    const params = new URLSearchParams(urlParams);
    const url = `${config.keysUrl}?${params.toString()}`;

    // URL length validation - Safari/Chrome have ~2048 char limit
    const URL_LENGTH_LIMIT = 2000;

    if (url.length > URL_LENGTH_LIMIT) {
      throw new Error(
        `Request data too large (${url.length} chars, limit: ${URL_LENGTH_LIMIT}). ` +
        `EIP-712 typed data or complex transactions may exceed URL limits. ` +
        `Consider using encrypted popup mode instead.`
      );
    }

    return url;
  }

  /**
   * Base64URL encode (URL-safe base64 encoding)
   * Replaces + with -, / with _, and removes padding =
   */
  private base64Encode(str: string): string {
    let base64: string;

    // Use global btoa if available, otherwise use Buffer
    if (typeof btoa !== 'undefined') {
      base64 = btoa(str);
    } else {
      // Fallback for React Native
      base64 = Buffer.from(str, 'utf-8').toString('base64');
    }

    // Convert to base64url format (URL-safe)
    return base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  }

  /**
   * Base64URL decode (URL-safe base64 decoding)
   * Replaces - with +, _ with /, and restores padding =
   */
  private base64Decode(str: string): string {
    // Convert from base64url to standard base64
    let base64 = str.replace(/-/g, '+').replace(/_/g, '/');

    // Restore padding
    const pad = base64.length % 4;
    if (pad > 0) {
      base64 += '='.repeat(4 - pad);
    }

    // Use global atob if available, otherwise use Buffer
    if (typeof atob !== 'undefined') {
      return atob(base64);
    }
    // Fallback for React Native
    return Buffer.from(base64, 'base64').toString('utf-8');
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
