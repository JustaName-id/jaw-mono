/**
 * Cross-Platform Mode exports
 *
 * Browser-based authentication using Safari View Controller / Chrome Custom Tab.
 * These real browser sessions fully support WebAuthn/passkeys.
 */

export {
  BrowserAuthenticator,
  type BrowserAuthConfig,
  type BrowserAuthResult,
  type SignMessageParams,
  type SignTypedDataParams,
  type TransactionParams,
} from './BrowserAuthenticator';
