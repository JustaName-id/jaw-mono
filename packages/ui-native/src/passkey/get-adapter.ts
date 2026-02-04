/**
 * Passkey Get Adapter
 *
 * Adapter for WebAuthn authentication (signing) to work with react-native-passkeys
 *
 * Usage:
 * ```typescript
 * import { sign } from 'viem/account-abstraction';
 * import { getCredentialAdapter } from '@jaw/ui-native/passkey';
 *
 * const signature = await sign({
 *   getFn: getCredentialAdapter,
 *   ...
 * });
 * ```
 */

import {
  arrayBufferToBase64URL,
  base64URLToArrayBuffer,
} from './utils';

// Types for WebAuthn credential request options
export interface PublicKeyCredentialRequestOptions {
  challenge: ArrayBuffer;
  timeout?: number;
  rpId?: string;
  allowCredentials?: Array<{
    type: 'public-key';
    id: ArrayBuffer;
    transports?: Array<'usb' | 'ble' | 'nfc' | 'internal'>;
  }>;
  userVerification?: 'discouraged' | 'preferred' | 'required';
}

// Types for react-native-passkeys get options
export interface RNPasskeyGetOptions {
  challenge: string; // Base64URL
  timeout?: number;
  rpId?: string;
  allowCredentials?: Array<{
    type: 'public-key';
    id: string; // Base64URL
    transports?: Array<string>;
  }>;
  userVerification?: 'discouraged' | 'preferred' | 'required';
}

// Types for react-native-passkeys get response
export interface RNPasskeyGetResponse {
  id: string; // Base64URL
  rawId: string; // Base64URL
  type: 'public-key';
  response: {
    clientDataJSON: string; // Base64URL
    authenticatorData: string; // Base64URL
    signature: string; // Base64URL
    userHandle?: string; // Base64URL
  };
  authenticatorAttachment?: string;
}

// Types for WebAuthn assertion response (what viem expects)
export interface PublicKeyCredentialAssertion {
  id: string;
  rawId: ArrayBuffer;
  type: 'public-key';
  response: {
    clientDataJSON: ArrayBuffer;
    authenticatorData: ArrayBuffer;
    signature: ArrayBuffer;
    userHandle: ArrayBuffer | null;
  };
  getClientExtensionResults(): Record<string, unknown>;
}

/**
 * Converts viem's credential request options to react-native-passkeys format
 */
function convertToRNGetOptions(
  options: PublicKeyCredentialRequestOptions
): RNPasskeyGetOptions {
  return {
    challenge: arrayBufferToBase64URL(options.challenge),
    timeout: options.timeout,
    rpId: options.rpId || 'keys.jaw.id',
    allowCredentials: options.allowCredentials?.map((cred) => ({
      type: cred.type,
      id: arrayBufferToBase64URL(cred.id),
      transports: cred.transports,
    })),
    userVerification: options.userVerification,
  };
}

/**
 * Converts react-native-passkeys get response to WebAuthn assertion format
 */
function convertFromRNGetResponse(
  response: RNPasskeyGetResponse
): PublicKeyCredentialAssertion {
  const rawId = base64URLToArrayBuffer(response.rawId);
  const clientDataJSON = base64URLToArrayBuffer(response.response.clientDataJSON);
  const authenticatorData = base64URLToArrayBuffer(
    response.response.authenticatorData
  );
  const signature = base64URLToArrayBuffer(response.response.signature);
  const userHandle = response.response.userHandle
    ? base64URLToArrayBuffer(response.response.userHandle)
    : null;

  return {
    id: response.id,
    rawId,
    type: 'public-key',
    response: {
      clientDataJSON,
      authenticatorData,
      signature,
      userHandle,
    },
    getClientExtensionResults: () => ({}),
  };
}

/**
 * Custom error class for native passkey unavailability
 */
export class NativePasskeyUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'NativePasskeyUnavailableError';
  }
}

/**
 * Get credential adapter for react-native-passkeys (authentication/signing)
 *
 * This function adapts WebAuthn's navigator.credentials.get to work with
 * the react-native-passkeys library
 *
 * @param options - WebAuthn credential request options
 * @returns Promise<PublicKeyCredentialAssertion> - The assertion response
 * @throws {NativePasskeyUnavailableError} When running in Expo Go or native module unavailable
 */
export async function getCredentialAdapter(
  options: CredentialRequestOptions
): Promise<Credential | null> {
  // Dynamically import react-native-passkeys to avoid bundling issues
  let Passkey: { get: (options: RNPasskeyGetOptions) => Promise<RNPasskeyGetResponse> };

  try {
    // Use destructuring to get the Passkey class from the module namespace
    const module = await import('react-native-passkey');
    Passkey = module.Passkey;

    // Check if the Passkey object is actually available (not just the JS wrapper)
    if (!Passkey || typeof Passkey.get !== 'function') {
      throw new NativePasskeyUnavailableError(
        'Native passkeys require a development build. ' +
        'The react-native-passkey native module is not available in Expo Go. ' +
        'Please use Cross-Platform mode, or run: npx expo prebuild && npx expo run:ios/android'
      );
    }
  } catch (error) {
    // Handle module import errors (Expo Go, missing native module)
    if (error instanceof NativePasskeyUnavailableError) {
      throw error;
    }

    const errorMessage = error instanceof Error ? error.message : String(error);

    // Check for common Expo Go / native module errors
    if (
      errorMessage.includes('Cannot find module') ||
      errorMessage.includes('native module') ||
      errorMessage.includes('NativeModule') ||
      errorMessage.includes('null is not an object')
    ) {
      throw new NativePasskeyUnavailableError(
        'Native passkeys require a development build. ' +
        'Please use Cross-Platform mode in Expo Go, or create a development build: ' +
        'npx expo prebuild && npx expo run:ios/android'
      );
    }

    throw new Error(
      'react-native-passkey is not installed or not properly linked. ' +
      'Please install it with: npm install react-native-passkey'
    );
  }

  if (!options.publicKey) {
    throw new Error('publicKey options are required');
  }

  const publicKeyOptions = options.publicKey as PublicKeyCredentialRequestOptions;

  // Convert options to react-native-passkeys format
  const rnOptions = convertToRNGetOptions(publicKeyOptions);

  try {
    // Call react-native-passkeys
    const rnResponse = await Passkey.get(rnOptions);

    // Convert response back to WebAuthn format
    const assertion = convertFromRNGetResponse(rnResponse);

    return assertion as unknown as Credential;
  } catch (error) {
    // Handle specific passkey errors
    if (error instanceof Error) {
      const errorMessage = error.message.toLowerCase();

      if (errorMessage.includes('cancelled') || errorMessage.includes('canceled')) {
        throw new DOMException('User cancelled the operation', 'NotAllowedError');
      }
      if (errorMessage.includes('not found')) {
        throw new DOMException('No credentials found', 'NotAllowedError');
      }
      if (errorMessage.includes('not supported')) {
        throw new DOMException('Passkeys not supported on this device', 'NotSupportedError');
      }
      // Handle Expo Go / native module errors that might occur during get()
      if (
        errorMessage.includes('null is not an object') ||
        errorMessage.includes('native module') ||
        errorMessage.includes('turbomodule')
      ) {
        throw new NativePasskeyUnavailableError(
          'Native passkeys require a development build. ' +
          'Please use Cross-Platform mode in Expo Go, or create a development build.'
        );
      }
    }
    throw error;
  }
}

export type { PublicKeyCredentialRequestOptions, PublicKeyCredentialAssertion };
