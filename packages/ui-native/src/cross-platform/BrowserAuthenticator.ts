/**
 * BrowserAuthenticator
 *
 * Implements authentication using expo-web-browser which opens:
 * - iOS: Safari View Controller (SVC)
 * - Android: Chrome Custom Tab (CCT)
 *
 * These are real browser sessions that fully support WebAuthn,
 * unlike embedded WebViews which block passkey operations.
 *
 * Flow:
 * 1. Open keys.jaw.id in Safari/Chrome with config in URL params
 * 2. User completes passkey authentication in browser
 * 3. Browser redirects to app via deep link with result
 * 4. App parses result and updates state
 */

import * as WebBrowser from 'expo-web-browser';
import * as Linking from 'expo-linking';

// SDK version - should match core package
const SDK_VERSION = '1.0.0';

export interface BrowserAuthConfig {
  apiKey: string;
  appName: string;
  appLogoUrl?: string;
  defaultChainId?: number;
  keysUrl: string;
  showTestnets?: boolean;
}

export interface BrowserAuthResult {
  success: boolean;
  address?: string;
  username?: string;
  credentialId?: string;
  signature?: string;
  txHash?: string;
  error?: string;
  data?: unknown;
}

export interface SignMessageParams {
  message: string;
  credentialId: string;
}

export interface SignTypedDataParams {
  typedData: string; // JSON stringified EIP-712 typed data
  credentialId: string;
}

export interface TransactionParams {
  to: string;
  value?: string;
  data?: string;
  credentialId: string;
  chainId?: number;
}

/**
 * BrowserAuthenticator class
 *
 * Handles authentication via Safari View Controller / Chrome Custom Tab.
 * WebAuthn/passkeys work in these real browser contexts.
 */
export class BrowserAuthenticator {
  private config: BrowserAuthConfig;
  private callbackUrl: string;

  constructor(config: BrowserAuthConfig) {
    this.config = config;
    // Generate callback URL using app's scheme
    // This creates a URL like: jaw-demo://auth
    this.callbackUrl = Linking.createURL('auth');
  }

  /**
   * Open browser for authentication
   *
   * Opens Safari View Controller (iOS) or Chrome Custom Tab (Android)
   * with keys.jaw.id. The user completes authentication there,
   * and the browser redirects back to the app with the result.
   */
  async connect(): Promise<BrowserAuthResult> {
    try {
      // 1. Build the auth URL with config in params
      const authUrl = this.buildAuthUrl('connect');

      // 2. Open browser and wait for callback
      const result = await WebBrowser.openAuthSessionAsync(
        authUrl,
        this.callbackUrl,
        {
          showInRecents: true,
          // Don't use ephemeral session - we want passkeys to persist
          preferEphemeralSession: false,
        }
      );

      // 3. Handle result
      if (result.type === 'success' && result.url) {
        return this.parseCallbackUrl(result.url);
      } else if (result.type === 'cancel') {
        return { success: false, error: 'User cancelled' };
      } else if (result.type === 'dismiss') {
        return { success: false, error: 'Browser dismissed' };
      } else {
        return { success: false, error: 'Authentication failed' };
      }
    } catch (error) {
      console.error('[BrowserAuthenticator] Error:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Sign a message using passkey authentication
   *
   * Opens browser with the message to sign. User confirms with passkey,
   * and the signature is returned via deep link redirect.
   */
  async signMessage(params: SignMessageParams): Promise<BrowserAuthResult> {
    try {
      const authUrl = this.buildAuthUrl('signMessage', {
        message: this.base64Encode(params.message),
        credentialId: params.credentialId,
      });

      const result = await WebBrowser.openAuthSessionAsync(
        authUrl,
        this.callbackUrl,
        {
          showInRecents: true,
          preferEphemeralSession: false,
        }
      );

      if (result.type === 'success' && result.url) {
        return this.parseCallbackUrl(result.url);
      } else if (result.type === 'cancel') {
        return { success: false, error: 'User cancelled' };
      } else if (result.type === 'dismiss') {
        return { success: false, error: 'Browser dismissed' };
      } else {
        return { success: false, error: 'Signing failed' };
      }
    } catch (error) {
      console.error('[BrowserAuthenticator] Sign message error:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Sign typed data (EIP-712) using passkey authentication
   *
   * Opens browser with the typed data to sign. User confirms with passkey,
   * and the signature is returned via deep link redirect.
   */
  async signTypedData(params: SignTypedDataParams): Promise<BrowserAuthResult> {
    try {
      const authUrl = this.buildAuthUrl('signTypedData', {
        typedData: this.base64Encode(params.typedData),
        credentialId: params.credentialId,
      });

      const result = await WebBrowser.openAuthSessionAsync(
        authUrl,
        this.callbackUrl,
        {
          showInRecents: true,
          preferEphemeralSession: false,
        }
      );

      if (result.type === 'success' && result.url) {
        return this.parseCallbackUrl(result.url);
      } else if (result.type === 'cancel') {
        return { success: false, error: 'User cancelled' };
      } else if (result.type === 'dismiss') {
        return { success: false, error: 'Browser dismissed' };
      } else {
        return { success: false, error: 'Signing failed' };
      }
    } catch (error) {
      console.error('[BrowserAuthenticator] Sign typed data error:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Send a transaction using passkey authentication
   *
   * Opens browser with the transaction details. User confirms with passkey,
   * and the transaction hash is returned via deep link redirect.
   */
  async sendTransaction(params: TransactionParams): Promise<BrowserAuthResult> {
    try {
      const txData = {
        to: params.to,
        value: params.value,
        data: params.data,
        chainId: params.chainId || this.config.defaultChainId,
      };

      const authUrl = this.buildAuthUrl('sendTransaction', {
        tx: this.base64Encode(JSON.stringify(txData)),
        credentialId: params.credentialId,
      });

      const result = await WebBrowser.openAuthSessionAsync(
        authUrl,
        this.callbackUrl,
        {
          showInRecents: true,
          preferEphemeralSession: false,
        }
      );

      if (result.type === 'success' && result.url) {
        return this.parseCallbackUrl(result.url);
      } else if (result.type === 'cancel') {
        return { success: false, error: 'User cancelled' };
      } else if (result.type === 'dismiss') {
        return { success: false, error: 'Browser dismissed' };
      } else {
        return { success: false, error: 'Transaction failed' };
      }
    } catch (error) {
      console.error('[BrowserAuthenticator] Send transaction error:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Build the auth URL with all config encoded in params
   */
  private buildAuthUrl(action: string, extraParams?: Record<string, string>): string {
    const configData = {
      version: SDK_VERSION,
      metadata: {
        appName: this.config.appName,
        appLogoUrl: this.config.appLogoUrl,
        defaultChainId: this.config.defaultChainId,
      },
      preference: {
        keysUrl: this.config.keysUrl,
        showTestnets: this.config.showTestnets,
      },
      apiKey: this.config.apiKey,
      location: 'react-native-browser',
    };

    const params = new URLSearchParams({
      callback: this.callbackUrl,
      mode: 'browser', // Signal to keys.jaw.id this is browser mode
      action: action,
      config: this.base64Encode(JSON.stringify(configData)),
      ...extraParams,
    });

    return `${this.config.keysUrl}?${params.toString()}`;
  }

  /**
   * Parse the callback URL from the browser redirect
   */
  private parseCallbackUrl(url: string): BrowserAuthResult {
    try {
      const parsed = Linking.parse(url);
      const queryParams = parsed.queryParams || {};

      // Check for error
      if (queryParams.error) {
        return {
          success: false,
          error: String(queryParams.error),
        };
      }

      // Check for result
      if (queryParams.result) {
        const resultStr = String(queryParams.result);
        const decoded = JSON.parse(this.base64Decode(resultStr));

        // Build result object based on what was returned
        const result: BrowserAuthResult = {
          success: true,
          data: decoded,
        };

        // Connection result
        if (decoded.address) {
          result.address = decoded.address;
          result.username = decoded.username;
          result.credentialId = decoded.credentialId;
        }

        // Sign message / sign typed data result
        if (decoded.signature) {
          result.signature = decoded.signature;
        }

        // Transaction result
        if (decoded.txHash) {
          result.txHash = decoded.txHash;
        }

        return result;
      }

      return { success: false, error: 'No result in callback' };
    } catch (error) {
      console.error('[BrowserAuthenticator] Parse error:', error);
      return {
        success: false,
        error: 'Failed to parse callback',
      };
    }
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

export default BrowserAuthenticator;
