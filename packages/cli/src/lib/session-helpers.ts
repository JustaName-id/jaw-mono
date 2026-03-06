import { loadConfig } from "./config.js";
import { clearSession, createSession, saveSession } from "./session-store.js";
import { isValidAddress } from "./validation.js";

export function handleLocalOnly(method: string): unknown {
  switch (method) {
    case "wallet_disconnect": {
      clearSession();
      return { success: true };
    }
    default:
      throw new Error(`Unhandled local-only method: ${method}`);
  }
}

export function maybeSaveSession(
  method: string,
  result: unknown,
  chainIdOverride?: number,
): void {
  if (method !== "wallet_connect" && method !== "eth_requestAccounts") return;

  try {
    const address = extractAddress(result);
    if (address) {
      const config = loadConfig();
      const chainId = chainIdOverride ?? config.defaultChain ?? 1;
      saveSession(createSession(address, chainId));
    }
  } catch {
    // Non-fatal: session save failure shouldn't break the flow
  }
}

export function extractAddress(result: unknown): string | undefined {
  let candidate: string | undefined;

  if (Array.isArray(result) && typeof result[0] === "string") {
    // ["0x..."]
    candidate = result[0];
  } else if (
    result &&
    typeof result === "object" &&
    "address" in result &&
    typeof (result as Record<string, unknown>).address === "string"
  ) {
    // { address: "0x..." }
    candidate = (result as Record<string, unknown>).address as string;
  } else if (result && typeof result === "object" && "accounts" in result) {
    // { accounts: [{ address: "0x..." }] }
    const accounts = (result as Record<string, unknown>).accounts;
    if (Array.isArray(accounts) && accounts.length > 0) {
      const first = accounts[0];
      if (typeof first === "string") {
        candidate = first;
      } else if (first && typeof first === "object" && "address" in first) {
        candidate = (first as Record<string, unknown>).address as string;
      }
    }
  }

  return candidate && isValidAddress(candidate) ? candidate : undefined;
}
