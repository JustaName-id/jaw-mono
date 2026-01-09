/**
 * Passkey Create Adapter
 *
 * Adapter for viem's createWebAuthnCredential to work with react-native-passkeys
 *
 * Usage:
 * ```typescript
 * import { createWebAuthnCredential } from 'viem/account-abstraction';
 * import { createCredentialAdapter } from '@jaw/ui-native/passkey';
 *
 * const credential = await createWebAuthnCredential({
 *   name: 'user@example.com',
 *   rp: { id: 'keys.jaw.id', name: 'JAW' },
 *   createFn: createCredentialAdapter,
 * });
 * ```
 */

import {
  arrayBufferToBase64URL,
  base64URLToArrayBuffer,
  extractPublicKeyFromAttestation,
  arrayBufferToHex,
} from './utils';

// Types for WebAuthn credential creation
export interface PublicKeyCredentialCreationOptions {
  challenge: ArrayBuffer;
  rp: {
    id?: string;
    name: string;
  };
  user: {
    id: ArrayBuffer;
    name: string;
    displayName: string;
  };
  pubKeyCredParams: Array<{
    type: 'public-key';
    alg: number;
  }>;
  timeout?: number;
  excludeCredentials?: Array<{
    type: 'public-key';
    id: ArrayBuffer;
    transports?: Array<'usb' | 'ble' | 'nfc' | 'internal'>;
  }>;
  authenticatorSelection?: {
    authenticatorAttachment?: 'platform' | 'cross-platform';
    requireResidentKey?: boolean;
    residentKey?: 'discouraged' | 'preferred' | 'required';
    userVerification?: 'discouraged' | 'preferred' | 'required';
  };
  attestation?: 'none' | 'indirect' | 'direct' | 'enterprise';
}

// Types for react-native-passkeys create options
export interface RNPasskeyCreateOptions {
  challenge: string; // Base64URL
  rp: {
    id: string;
    name: string;
  };
  user: {
    id: string; // Base64URL
    name: string;
    displayName: string;
  };
  pubKeyCredParams: Array<{
    type: 'public-key';
    alg: number;
  }>;
  timeout?: number;
  excludeCredentials?: Array<{
    type: 'public-key';
    id: string; // Base64URL
    transports?: Array<string>;
  }>;
  authenticatorSelection?: {
    authenticatorAttachment?: 'platform' | 'cross-platform';
    requireResidentKey?: boolean;
    residentKey?: 'discouraged' | 'preferred' | 'required';
    userVerification?: 'discouraged' | 'preferred' | 'required';
  };
  attestation?: 'none' | 'indirect' | 'direct' | 'enterprise';
}

// Types for react-native-passkeys create response
export interface RNPasskeyCreateResponse {
  id: string; // Base64URL
  rawId: string; // Base64URL
  type: 'public-key';
  response: {
    clientDataJSON: string; // Base64URL
    attestationObject: string; // Base64URL
  };
  authenticatorAttachment?: string;
}

// Types for WebAuthn credential response (what viem expects)
export interface PublicKeyCredential {
  id: string;
  rawId: ArrayBuffer;
  type: 'public-key';
  response: {
    clientDataJSON: ArrayBuffer;
    attestationObject: ArrayBuffer;
    getPublicKey(): ArrayBuffer | null;
    getAuthenticatorData(): ArrayBuffer;
    getTransports(): string[];
  };
  getClientExtensionResults(): Record<string, unknown>;
}

/**
 * Converts viem's credential creation options to react-native-passkeys format
 */
function convertToRNOptions(
  options: PublicKeyCredentialCreationOptions
): RNPasskeyCreateOptions {
  return {
    challenge: arrayBufferToBase64URL(options.challenge),
    rp: {
      id: options.rp.id || 'keys.jaw.id',
      name: options.rp.name,
    },
    user: {
      id: arrayBufferToBase64URL(options.user.id),
      name: options.user.name,
      displayName: options.user.displayName,
    },
    pubKeyCredParams: options.pubKeyCredParams,
    timeout: options.timeout,
    excludeCredentials: options.excludeCredentials?.map((cred) => ({
      type: cred.type,
      id: arrayBufferToBase64URL(cred.id),
      transports: cred.transports,
    })),
    authenticatorSelection: options.authenticatorSelection,
    attestation: options.attestation,
  };
}

/**
 * Converts react-native-passkeys response to WebAuthn credential format
 */
function convertFromRNResponse(
  response: RNPasskeyCreateResponse
): PublicKeyCredential {
  const rawId = base64URLToArrayBuffer(response.rawId);
  const clientDataJSON = base64URLToArrayBuffer(response.response.clientDataJSON);
  const attestationObject = base64URLToArrayBuffer(
    response.response.attestationObject
  );

  // Extract public key from attestation object in SPKI format
  // (react-native-quick-crypto requires SPKI/DER format for crypto.subtle.importKey)
  const publicKey = extractPublicKeyFromAttestation(attestationObject, true);

  return {
    id: response.id,
    rawId,
    type: 'public-key',
    response: {
      clientDataJSON,
      attestationObject,
      getPublicKey: () => {
        // Return the extracted public key (65 bytes: 0x04 || x || y)
        return publicKey;
      },
      getAuthenticatorData: () => {
        // Extract authenticator data from attestationObject
        // This is a simplified implementation
        return attestationObject;
      },
      getTransports: () => {
        return ['internal'];
      },
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
 * Create credential adapter for react-native-passkeys
 *
 * This function adapts viem's createWebAuthnCredential to work with
 * the react-native-passkeys library
 *
 * @param options - WebAuthn credential creation options (from viem)
 * @returns Promise<PublicKeyCredential> - The created credential
 * @throws {NativePasskeyUnavailableError} When running in Expo Go or native module unavailable
 */
export async function createCredentialAdapter(
  options: CredentialCreationOptions
): Promise<Credential | null> {
  // Dynamically import react-native-passkeys to avoid bundling issues
  // when the adapter is imported but not used
  let Passkey: { create: (options: RNPasskeyCreateOptions) => Promise<RNPasskeyCreateResponse> };

  try {
    // Use destructuring to get the Passkey class from the module namespace
    const module = await import('react-native-passkey');
    Passkey = module.Passkey;

    // Check if the Passkey object is actually available (not just the JS wrapper)
    if (!Passkey || typeof Passkey.create !== 'function') {
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

  const publicKeyOptions = options.publicKey as PublicKeyCredentialCreationOptions;

  // Convert options to react-native-passkeys format
  const rnOptions = convertToRNOptions(publicKeyOptions);

  try {
    // Call react-native-passkeys
    const rnResponse = await Passkey.create(rnOptions);

    // Convert response back to WebAuthn format
    const credential = convertFromRNResponse(rnResponse);

    return credential as unknown as Credential;
  } catch (error) {
    // Handle specific passkey errors
    if (error instanceof Error) {
      const errorMessage = error.message.toLowerCase();

      if (errorMessage.includes('cancelled') || errorMessage.includes('canceled')) {
        throw new DOMException('User cancelled the operation', 'NotAllowedError');
      }
      if (errorMessage.includes('not supported')) {
        throw new DOMException('Passkeys not supported on this device', 'NotSupportedError');
      }
      // Handle Expo Go / native module errors that might occur during create()
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

/**
 * Result from createNativePasskeyCredential
 * This matches the format expected by viem's toWebAuthnAccount
 */
export interface NativePasskeyCredentialResult {
  id: string;
  publicKey: `0x${string}`;
  raw: PublicKeyCredential;
}

/**
 * Create a passkey credential for React Native without using crypto.subtle
 *
 * This bypasses viem's createWebAuthnCredential which uses crypto.subtle
 * operations that aren't fully supported by react-native-quick-crypto.
 *
 * @param username - The username for the passkey
 * @param rpId - The relying party ID (domain)
 * @param rpName - The relying party name
 * @returns Credential result with id, publicKey (hex), and raw credential
 */
export async function createNativePasskeyCredential(
  username: string,
  rpId: string,
  rpName: string
): Promise<NativePasskeyCredentialResult> {
  // Dynamically import react-native-passkeys
  let Passkey: { create: (options: RNPasskeyCreateOptions) => Promise<RNPasskeyCreateResponse> };

  try {
    const module = await import('react-native-passkey');
    Passkey = module.Passkey;

    if (!Passkey || typeof Passkey.create !== 'function') {
      throw new NativePasskeyUnavailableError(
        'Native passkeys require a development build. ' +
        'The react-native-passkey native module is not available in Expo Go. ' +
        'Please use Cross-Platform mode, or run: npx expo prebuild && npx expo run:ios/android'
      );
    }
  } catch (error) {
    if (error instanceof NativePasskeyUnavailableError) {
      throw error;
    }

    const errorMessage = error instanceof Error ? error.message : String(error);
    if (
      errorMessage.includes('Cannot find module') ||
      errorMessage.includes('native module') ||
      errorMessage.includes('NativeModule') ||
      errorMessage.includes('null is not an object')
    ) {
      throw new NativePasskeyUnavailableError(
        'Native passkeys require a development build. ' +
        'Please use Cross-Platform mode in Expo Go, or create a development build.'
      );
    }

    throw new Error(
      'react-native-passkey is not installed or not properly linked. ' +
      'Please install it with: npm install react-native-passkey'
    );
  }

  // Generate challenge and user ID
  const challenge = crypto.getRandomValues(new Uint8Array(32));
  const userId = crypto.getRandomValues(new Uint8Array(32));

  // Create passkey options
  const rnOptions: RNPasskeyCreateOptions = {
    challenge: arrayBufferToBase64URL(challenge.buffer),
    rp: {
      id: rpId,
      name: rpName,
    },
    user: {
      id: arrayBufferToBase64URL(userId.buffer),
      name: username,
      displayName: username,
    },
    pubKeyCredParams: [
      { type: 'public-key', alg: -7 }, // ES256
    ],
    timeout: 60000,
    authenticatorSelection: {
      authenticatorAttachment: 'platform',
      residentKey: 'required',
      userVerification: 'required',
    },
    attestation: 'none',
  };

  try {
    // Create the passkey
    const rnResponse = await Passkey.create(rnOptions);

    // Extract public key from attestation (raw format for hex conversion)
    const attestationBuffer = base64URLToArrayBuffer(rnResponse.response.attestationObject);
    const publicKeyBuffer = extractPublicKeyFromAttestation(attestationBuffer, false);

    if (!publicKeyBuffer) {
      throw new Error('Failed to extract public key from attestation object');
    }

    // Convert to hex for viem
    const publicKeyHex = arrayBufferToHex(publicKeyBuffer);

    // Create the raw credential object for viem
    const rawCredential = convertFromRNResponse(rnResponse);

    return {
      id: rnResponse.id,
      publicKey: publicKeyHex,
      raw: rawCredential,
    };
  } catch (error) {
    if (error instanceof Error) {
      const errorMessage = error.message.toLowerCase();

      if (errorMessage.includes('cancelled') || errorMessage.includes('canceled')) {
        throw new DOMException('User cancelled the operation', 'NotAllowedError');
      }
      if (errorMessage.includes('not supported')) {
        throw new DOMException('Passkeys not supported on this device', 'NotSupportedError');
      }
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

export type { PublicKeyCredentialCreationOptions, PublicKeyCredential };
