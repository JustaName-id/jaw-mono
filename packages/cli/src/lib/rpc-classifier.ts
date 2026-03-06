/**
 * Classifies EIP-1193 RPC methods by whether they need browser signing.
 */

export type MethodCategory =
  | "read-only"
  | "signing-required"
  | "session-management"
  | "local-only";

const METHOD_MAP: Record<string, MethodCategory> = {
  // Read-only: no browser interaction needed
  eth_accounts: "read-only",
  eth_chainId: "read-only",
  net_version: "read-only",
  wallet_getCallsStatus: "read-only",
  wallet_getCallsHistory: "read-only",
  wallet_getAssets: "read-only",
  wallet_getCapabilities: "read-only",
  wallet_getPermissions: "read-only",

  // Signing: requires browser + passkey
  wallet_sendCalls: "signing-required",
  eth_sendTransaction: "signing-required",
  personal_sign: "signing-required",
  eth_signTypedData_v4: "signing-required",
  wallet_sign: "signing-required",
  wallet_grantPermissions: "signing-required",
  wallet_revokePermissions: "signing-required",

  // Session management: browser auth flow
  eth_requestAccounts: "session-management",
  wallet_connect: "session-management",
  wallet_disconnect: "local-only",
  wallet_switchEthereumChain: "session-management",
};

export function classifyMethod(method: string): MethodCategory {
  return METHOD_MAP[method] ?? "signing-required";
}

export function needsBrowser(method: string): boolean {
  const category = classifyMethod(method);
  return category === "signing-required" || category === "session-management";
}

export const SUPPORTED_METHODS = Object.keys(METHOD_MAP);
