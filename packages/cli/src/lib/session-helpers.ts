import { loadConfig } from "./config.js";
import {
  clearSession,
  createSession,
  loadSession,
  saveSession,
} from "./session-store.js";
import { isValidAddress } from "./validation.js";

export function handleLocalOnly(method: string, params?: unknown): unknown {
  switch (method) {
    case "wallet_disconnect": {
      clearSession();
      return { success: true };
    }
    case "wallet_switchEthereumChain": {
      const chainIdHex = extractChainId(params);
      if (!chainIdHex) {
        throw new Error(
          'wallet_switchEthereumChain requires params: [{ chainId: "0x..." }]',
        );
      }
      const chainId = Number(chainIdHex);
      if (Number.isNaN(chainId) || chainId <= 0) {
        throw new Error(`Invalid chainId: ${chainIdHex}`);
      }
      const session = loadSession();
      if (session) {
        saveSession({ ...session, chainId });
      }
      return null;
    }
    default:
      throw new Error(`Unhandled local-only method: ${method}`);
  }
}

function extractChainId(params: unknown): string | undefined {
  if (!Array.isArray(params) || params.length === 0) return undefined;
  const first = params[0];
  if (first && typeof first === "object" && "chainId" in first) {
    return (first as Record<string, unknown>).chainId as string;
  }
  return undefined;
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
  } catch (err) {
    process.stderr.write(
      `Warning: failed to save session: ${err instanceof Error ? err.message : err}\n`,
    );
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
