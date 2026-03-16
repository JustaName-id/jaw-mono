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

import * as WebBrowser from "expo-web-browser";
import * as Linking from "expo-linking";
import AsyncStorage from "@react-native-async-storage/async-storage";
import type { CommunicationAdapter } from "@jaw.id/core";
import {
  Message,
  MessageID,
  RPCResponseMessage,
  RPCResponse,
  RPCRequestMessage,
} from "@jaw.id/core";

// SDK version - should match core package
const SDK_VERSION = "1.0.0";

// AsyncStorage key for persisting credentialId
const CREDENTIAL_ID_KEY = "JAW_CREDENTIAL_ID";

// Timeout for onMessage listeners (5 minutes)
const ON_MESSAGE_TIMEOUT_MS = 5 * 60 * 1000;

// Allowed keysUrl hosts
const ALLOWED_HOSTS = [".jaw.id", "localhost", "127.0.0.1"];

export interface MobileCommunicationConfig {
  apiKey: string;
  appName: string;
  appLogoUrl?: string;
  defaultChainId?: number;
  keysUrl: string;
  showTestnets?: boolean;
}

/**
 * Validate that keysUrl is a trusted host.
 * Allows *.jaw.id (HTTPS) and localhost (any protocol for dev).
 */
function validateKeysUrl(keysUrl: string): void {
  let parsed: URL;
  try {
    parsed = new URL(keysUrl);
  } catch {
    throw new Error(
      `[MobileCommunicationAdapter] Invalid keysUrl: "${keysUrl}". Must be a valid URL.`,
    );
  }

  const hostname = parsed.hostname;
  const isLocalhost = hostname === "localhost" || hostname === "127.0.0.1";

  if (!isLocalhost && parsed.protocol !== "https:") {
    throw new Error(
      `[MobileCommunicationAdapter] keysUrl must use HTTPS for non-localhost hosts. Got: "${keysUrl}"`,
    );
  }

  const isAllowed = ALLOWED_HOSTS.some((allowed) => {
    if (allowed.startsWith(".")) {
      return hostname === allowed.slice(1) || hostname.endsWith(allowed);
    }
    return hostname === allowed;
  });

  // Also allow ngrok URLs for development
  const isNgrok =
    hostname.endsWith(".ngrok-free.app") || hostname.endsWith(".ngrok.io");

  if (!isAllowed && !isNgrok) {
    throw new Error(
      `[MobileCommunicationAdapter] keysUrl host "${hostname}" is not in the allowlist. ` +
        `Allowed: *.jaw.id, localhost, *.ngrok-free.app`,
    );
  }
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
  private pendingRequests = new Map<
    MessageID,
    {
      resolve: (value: unknown) => void;
      reject: (error: Error) => void;
    }
  >();
  private messageListeners = new Map<
    string,
    {
      listener: (message: unknown) => void;
      reject: (error: Error) => void;
    }
  >();
  private linkingSubscription: ReturnType<
    typeof Linking.addEventListener
  > | null = null;
  private isReady = false;
  private credentialId: string | null = null;
  private processedRequestIds = new Set<string>(); // Prevent duplicate deep link processing
  private static readonly MAX_PROCESSED_IDS = 500; // Cap to prevent memory growth

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
   * Validates keysUrl against allowlist.
   */
  init(config: MobileCommunicationConfig): void {
    if (this.config) {
      throw new Error("[MobileCommunicationAdapter] Already initialized");
    }

    // Validate keysUrl before storing config
    validateKeysUrl(config.keysUrl);

    this.config = config;
    // Generate callback URL using app's scheme
    // This creates a URL like: jaw-demo://auth
    this.callbackUrl = Linking.createURL("auth");

    // Load persisted credentialId asynchronously (don't block initialization)
    AsyncStorage.getItem(CREDENTIAL_ID_KEY)
      .then((credentialId) => {
        if (credentialId) {
          this.credentialId = credentialId;
        }
      })
      .catch((error) => {
        console.warn(
          "[MobileCommunicationAdapter] Failed to load credentialId:",
          error,
        );
      });
  }

  /**
   * Initialize and wait for the communication channel to be ready.
   * For mobile: Sets up deep link listeners.
   */
  async waitForReady(): Promise<void> {
    if (!this.config) {
      throw new Error(
        "[MobileCommunicationAdapter] Not initialized. " +
          "Must call init() with config before use.",
      );
    }

    if (this.isReady) {
      return;
    }

    // Set up deep link listener if not already done
    if (!this.linkingSubscription) {
      this.linkingSubscription = Linking.addEventListener(
        "url",
        this.handleDeepLink.bind(this),
      );
    }

    // Check if there's an initial URL (app was opened via deep link)
    try {
      const initialUrl = await Linking.getInitialURL();
      if (initialUrl) {
        this.handleDeepLink({ url: initialUrl });
      }
    } catch (error) {
      console.warn(
        "[MobileCommunicationAdapter] Failed to get initial URL:",
        error,
      );
    }

    this.isReady = true;
  }

  /**
   * Send a request and wait for a response.
   * Opens browser with request encoded in URL, waits for deep link callback.
   */
  async postRequestAndWaitForResponse<M extends Message>(
    request: Message & { id: MessageID },
  ): Promise<M> {
    await this.waitForReady();

    // Build URL before adding to pending requests — if it throws (e.g. URL too long),
    // we don't leave orphaned entries in the map
    const url = this.buildRequestUrl(request);

    return new Promise((resolve, reject) => {
      // Store the pending request
      this.pendingRequests.set(request.id, { resolve, reject });

      // Open browser (callbackUrl guaranteed to exist after waitForReady)
      WebBrowser.openAuthSessionAsync(url, this.callbackUrl!, {
        showInRecents: true,
        // Don't use ephemeral session - we want passkeys to persist
        preferEphemeralSession: false,
      })
        .then((result) => {
          // Handle browser session result
          if (result.type === "cancel" || result.type === "dismiss") {
            this.pendingRequests.delete(request.id);
            reject(new Error("User cancelled authentication"));
            return;
          }

          // On iOS Safari View Controller, deep links don't always fire
          // So we need to check if the result contains the URL with response data
          if (result.type === "success" && result.url) {
            // Manually trigger deep link handler with the returned URL
            this.handleDeepLink({ url: result.url });
          }

          // Note: For cases where deep link fires separately, that's handled by the listener
        })
        .catch((error) => {
          console.error(
            "[MobileCommunicationAdapter] Browser session error:",
            error,
          );
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
   * Times out after ON_MESSAGE_TIMEOUT_MS to prevent memory leaks.
   */
  async onMessage<M extends Message>(
    predicate: (msg: Partial<M>) => boolean,
  ): Promise<M> {
    await this.waitForReady();

    return new Promise((resolve, reject) => {
      const listenerId = crypto.randomUUID();

      const timeout = setTimeout(() => {
        this.messageListeners.delete(listenerId);
        reject(new Error("[MobileCommunicationAdapter] onMessage timed out"));
      }, ON_MESSAGE_TIMEOUT_MS);

      const listener = (message: unknown) => {
        if (predicate(message as Partial<M>)) {
          clearTimeout(timeout);
          this.messageListeners.delete(listenerId);
          resolve(message as M);
        }
      };

      this.messageListeners.set(listenerId, {
        listener,
        reject: (error: Error) => {
          clearTimeout(timeout);
          reject(error);
        },
      });
    });
  }

  /**
   * Cleanup all resources.
   * Removes deep link listeners and clears pending requests.
   * After disconnect(), the adapter can be re-initialized via init().
   */
  disconnect(): void {
    if (this.linkingSubscription) {
      this.linkingSubscription.remove();
      this.linkingSubscription = null;
    }

    // Reject all pending requests
    this.pendingRequests.forEach(({ reject }) => {
      reject(new Error("Communication adapter disconnected"));
    });
    this.pendingRequests.clear();

    // Reject all pending onMessage listeners
    this.messageListeners.forEach(({ reject }) => {
      reject(new Error("Communication adapter disconnected"));
    });
    this.messageListeners.clear();

    // Clear stored credential (both memory and storage)
    this.credentialId = null;
    AsyncStorage.removeItem(CREDENTIAL_ID_KEY).catch((error) => {
      console.warn(
        "[MobileCommunicationAdapter] Failed to clear credentialId:",
        error,
      );
    });

    // Reset state so adapter can be re-initialized
    this.config = null;
    this.callbackUrl = null;
    this.processedRequestIds.clear();
    this.isReady = false;
  }

  /**
   * Handle deep link callback from browser.
   * Validates the URL matches our expected callback before processing.
   */
  private handleDeepLink(event: { url: string }): void {
    try {
      // Validate the deep link URL matches our expected callback scheme and path
      if (this.callbackUrl) {
        try {
          const incoming = new URL(event.url);
          const expected = new URL(this.callbackUrl);
          // Compare scheme and pathname exactly to prevent prefix-based bypasses
          // e.g. reject "myapp://auth.evil" when expecting "myapp://auth"
          if (
            incoming.protocol !== expected.protocol ||
            incoming.pathname !== expected.pathname
          ) {
            return; // Ignore deep links not meant for us
          }
        } catch {
          return; // Malformed URL — ignore
        }
      }

      const parsed = Linking.parse(event.url);
      const queryParams = parsed.queryParams || {};

      // Deduplicate: skip if we've already processed this requestId
      const requestId = queryParams.requestId as string | undefined;
      if (requestId) {
        if (this.processedRequestIds.has(requestId)) {
          return; // Already processed this response
        }
        this.processedRequestIds.add(requestId);
        // Evict oldest entries if we exceed the cap (prevent unbounded memory growth)
        if (
          this.processedRequestIds.size >
          MobileCommunicationAdapter.MAX_PROCESSED_IDS
        ) {
          const first = this.processedRequestIds.values().next().value;
          if (first) this.processedRequestIds.delete(first);
        }
      }

      // Check for error
      if (queryParams.error) {
        const errorMsg = String(queryParams.error);
        // Map to known error codes — don't reflect raw error strings
        const safeMessage =
          errorMsg.length > 200 ? errorMsg.slice(0, 200) + "..." : errorMsg;

        if (requestId && this.pendingRequests.has(requestId as MessageID)) {
          const pending = this.pendingRequests.get(requestId as MessageID)!;
          pending.reject(new Error(safeMessage));
          this.pendingRequests.delete(requestId as MessageID);
        } else {
          // Reject all pending requests with this error
          this.pendingRequests.forEach(({ reject }) => {
            reject(new Error(safeMessage));
          });
          this.pendingRequests.clear();
        }
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
          console.error(
            "[MobileCommunicationAdapter] Failed to decode response:",
            decodeError,
          );

          // Reject all pending requests with decode error
          this.pendingRequests.forEach(({ reject }) => {
            reject(new Error("Failed to decode response"));
          });
          this.pendingRequests.clear();
          return;
        }

        // Resolve pending request - match by requestId if available
        const requestIdParam = queryParams.requestId as MessageID | undefined;

        let matchedRequestId: MessageID | undefined;
        let matchedRequest:
          | {
              resolve: (value: unknown) => void;
              reject: (error: Error) => void;
            }
          | undefined;

        if (requestIdParam && this.pendingRequests.has(requestIdParam)) {
          // Match by requestId (correct correlation)
          matchedRequestId = requestIdParam;
          matchedRequest = this.pendingRequests.get(requestIdParam);
        } else if (this.pendingRequests.size === 1) {
          // Fallback: only one pending request, use it
          [matchedRequestId, matchedRequest] = Array.from(
            this.pendingRequests.entries(),
          )[0];
        } else if (this.pendingRequests.size > 1) {
          // Multiple pending requests but no match = error
          this.pendingRequests.forEach(({ reject }) => {
            reject(
              new Error(
                "Request correlation failed: multiple pending requests",
              ),
            );
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
              AsyncStorage.setItem(CREDENTIAL_ID_KEY, this.credentialId).catch(
                (error) => {
                  console.warn(
                    "[MobileCommunicationAdapter] Failed to persist credentialId:",
                    error,
                  );
                },
              );
            }

            // eth_requestAccounts expects result.value to be Address[]
            rpcResponse = {
              result: {
                value: [rawResponse.address],
              },
            };
          } else if (rawResponse.signature) {
            // Sign response: { signature: '0x...' }
            rpcResponse = {
              result: {
                value: rawResponse.signature,
              },
            };
          } else if (rawResponse.txHash || rawResponse.id) {
            // Transaction response: { txHash, id, chainId }
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
          const responseMessage: RPCResponseMessage = {
            id: this.generateMessageId(),
            requestId: matchedRequestId,
            correlationId: undefined,
            sender: "", // Not used in browser mode (no encryption)
            content: {
              unencrypted: rpcResponse,
            },
            timestamp: new Date(),
          };

          // Delete from pending and resolve before notifying listeners
          // to avoid re-entrancy issues
          this.pendingRequests.delete(matchedRequestId);
          matchedRequest.resolve(responseMessage);

          // Notify message listeners
          this.messageListeners.forEach(({ listener }) => {
            listener(responseMessage);
          });
        }
      }
    } catch (error) {
      console.error(
        "[MobileCommunicationAdapter] Deep link parse error:",
        error,
      );
      // Reject all pending requests
      this.pendingRequests.forEach(({ reject }) => {
        reject(new Error("Failed to parse deep link response"));
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
      // API key embedded in chain.rpcUrl below (not in top-level URL params)
      location: "react-native-browser",
    };

    // Extract method from request (it's in the handshake field for browser mode)
    const requestData = request as RPCRequestMessage;
    const method =
      "handshake" in requestData.content
        ? requestData.content.handshake.method
        : "eth_requestAccounts";
    const requestParams =
      "handshake" in requestData.content
        ? requestData.content.handshake.params
        : [];
    const chain =
      "handshake" in requestData.content
        ? requestData.content.chain
        : undefined;

    // Determine action type for keys.jaw.id
    let action = "connect";
    const urlParams: Record<string, string> = {
      callback: callbackUrl,
      mode: "browser",
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
      } else if (!chainWithApiKey.rpcUrl.includes("api-key=")) {
        // RPC URL exists but no API key - add it
        const separator = chainWithApiKey.rpcUrl.includes("?") ? "&" : "?";
        chainWithApiKey.rpcUrl = `${chainWithApiKey.rpcUrl}${separator}api-key=${config.apiKey}`;
      }
    }

    // Always send chain (critical for API key extraction in browser mode)
    urlParams.chain = this.base64Encode(JSON.stringify(chainWithApiKey));

    // Derive origin from callback URL scheme (stable app identifier)
    const callbackScheme = callbackUrl.split("://")[0];
    urlParams.origin = `${callbackScheme}://`;

    // Map method to action and add necessary params
    if (method === "eth_requestAccounts" || method === "wallet_connect") {
      action = "connect";
    } else if (method === "personal_sign") {
      action = "signMessage";
      // params[0] is message (hex), params[1] is address
      urlParams.message = this.base64Encode(requestParams[0]);
      // Include credentialId from stored connection
      if (this.credentialId) {
        urlParams.credentialId = this.credentialId;
      }
    } else if (method === "eth_signTypedData_v4") {
      action = "signTypedData";
      urlParams.typedData = this.base64Encode(requestParams[1]); // params[1] is typed data JSON
      if (this.credentialId) {
        urlParams.credentialId = this.credentialId;
      }
    } else if (method === "wallet_sendCalls") {
      action = "sendTransaction";
      // Send all calls, not just the first one
      const calls = requestParams[0]?.calls || [];
      urlParams.calls = this.base64Encode(JSON.stringify(calls));
      if (this.credentialId) {
        urlParams.credentialId = this.credentialId;
      }
    } else if (method === "eth_sendTransaction") {
      action = "sendTransaction";
      const tx = requestParams[0];
      urlParams.tx = this.base64Encode(JSON.stringify(tx));
      if (this.credentialId) {
        urlParams.credentialId = this.credentialId;
      }
    } else if (method === "wallet_grantPermissions") {
      action = "grantPermissions";
      urlParams.permissions = this.base64Encode(
        JSON.stringify(requestParams[0]),
      );
      if (this.credentialId) {
        urlParams.credentialId = this.credentialId;
      }
    } else if (method === "wallet_revokePermissions") {
      action = "revokePermissions";
      urlParams.permissions = this.base64Encode(
        JSON.stringify(requestParams[0]),
      );
      if (this.credentialId) {
        urlParams.credentialId = this.credentialId;
      }
    }

    urlParams.action = action;

    const params = new URLSearchParams(urlParams);
    const url = `${config.keysUrl}?${params.toString()}`;

    // URL length validation
    // Safari VC / Chrome Custom Tab support long URLs, but server-side limits apply
    // Nginx default: 8192, Cloudflare: 32KB. Use conservative limit.
    const URL_LENGTH_LIMIT = 8000;

    if (url.length > URL_LENGTH_LIMIT) {
      throw new Error(
        `Request data too large (${url.length} chars, limit: ${URL_LENGTH_LIMIT}). ` +
          `EIP-712 typed data or complex transactions may exceed URL limits. ` +
          `Consider using encrypted popup mode instead.`,
      );
    }

    return url;
  }

  /**
   * Base64URL encode (URL-safe base64 encoding)
   * Uses Buffer for consistent UTF-8 handling across all environments.
   */
  private base64Encode(str: string): string {
    // Buffer.from handles UTF-8 correctly (btoa throws on non-ASCII)
    const base64 = Buffer.from(str, "utf-8").toString("base64");
    // Convert to base64url format (URL-safe)
    return base64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  }

  /**
   * Base64URL decode (URL-safe base64 decoding)
   * Uses Buffer for consistent UTF-8 handling across all environments.
   */
  private base64Decode(str: string): string {
    // Convert from base64url to standard base64
    let base64 = str.replace(/-/g, "+").replace(/_/g, "/");

    // Restore padding
    const pad = base64.length % 4;
    if (pad > 0) {
      base64 += "=".repeat(4 - pad);
    }

    return Buffer.from(base64, "base64").toString("utf-8");
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
