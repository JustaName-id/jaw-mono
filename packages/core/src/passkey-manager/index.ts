export { PasskeyManager } from './passkeyManager.js';
export type {
  PasskeyCredential,
  PasskeyAccount,
  AuthCheckResult,
  AuthState,
  PasskeyRegistrationRequest,
  PasskeyLookupResponse,
  BackendResponse,
  PasskeysByCredIdsResponse,
  LookupPasskeysRequest,
} from './types.js';
export {
  registerPasskeyInBackend,
  lookupPasskeyFromBackend,
  authenticateWithWebAuthn,
  PasskeyRegistrationError,
  PasskeyLookupError,
  WebAuthnAuthenticationError,
  type WebAuthnAuthenticationResult,
} from './utils.js';

