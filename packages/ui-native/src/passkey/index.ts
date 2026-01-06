/**
 * Passkey Adapters for React Native
 *
 * These adapters allow viem's WebAuthn credential functions to work with
 * react-native-passkeys on iOS and Android.
 *
 * @example
 * ```typescript
 * import { createWebAuthnCredential } from 'viem/account-abstraction';
 * import { createCredentialAdapter, getCredentialAdapter } from '@jaw/ui-native';
 *
 * // Create a new passkey
 * const credential = await createWebAuthnCredential({
 *   name: 'user@example.com',
 *   rp: { id: 'keys.jaw.id', name: 'JAW' },
 *   createFn: createCredentialAdapter,
 * });
 *
 * // Sign with passkey
 * const result = await sign({
 *   getFn: getCredentialAdapter,
 *   ...
 * });
 * ```
 */

export * from './utils';
export * from './create-adapter';
export * from './get-adapter';

// Re-export types for convenience
export type {
  PublicKeyCredentialCreationOptions,
  PublicKeyCredential,
} from './create-adapter';

export type {
  PublicKeyCredentialRequestOptions,
  PublicKeyCredentialAssertion,
} from './get-adapter';
