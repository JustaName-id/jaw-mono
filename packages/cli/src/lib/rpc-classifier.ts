/**
 * Classifies RPC methods to determine if they require browser interaction.
 * Used to show appropriate terminal prompts to the user.
 */

const BROWSER_REQUIRED_METHODS = new Set([
  // Signing
  'personal_sign',
  'eth_signTypedData_v4',
  'wallet_sign',
  // Transactions
  'wallet_sendCalls',
  'eth_sendTransaction',
  // Connection / account
  'wallet_connect',
  'eth_requestAccounts',
  // Permissions
  'wallet_grantPermissions',
  'wallet_revokePermissions',
]);

export function requiresBrowser(method: string): boolean {
  return BROWSER_REQUIRED_METHODS.has(method);
}

const SESSION_SUPPORTED_METHODS = new Set([
  'eth_requestAccounts',
  'eth_accounts',
  'wallet_sendCalls',
  'wallet_getCallsStatus',
  'personal_sign',
  'eth_signTypedData_v4',
]);

export function supportsSessionMode(method: string): boolean {
  return SESSION_SUPPORTED_METHODS.has(method);
}
