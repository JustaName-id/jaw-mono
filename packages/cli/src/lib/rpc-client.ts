/**
 * Direct JSON-RPC client for read-only JAW API methods.
 * No browser or popup needed — just HTTP POST to the proxy.
 */

import * as crypto from "node:crypto";

const JAW_RPC_HANDLE_URL = "https://api.justaname.id/proxy/v1/rpc/handle";

/**
 * Make a direct JSON-RPC call to the JAW proxy API.
 *
 * @param method - RPC method name (e.g. wallet_getAssets)
 * @param params - Method parameters (already an array)
 * @param apiKey - API key for authentication
 * @returns The result field from the JSON-RPC response
 */
export async function fetchJawRpc(
  method: string,
  params: unknown[],
  apiKey: string,
): Promise<unknown> {
  const body = {
    jsonrpc: "2.0",
    id: crypto.randomUUID(),
    method,
    params,
  };

  const response = await fetch(JAW_RPC_HANDLE_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(30_000),
  });

  if (!response.ok) {
    throw new Error(
      `JAW API request failed: ${response.status} ${response.statusText}`,
    );
  }

  const json = (await response.json()) as {
    result?: unknown;
    error?: { code: number; message: string };
  };

  if (json.error) {
    throw new Error(`[${json.error.code}] ${json.error.message}`);
  }

  return json.result;
}
