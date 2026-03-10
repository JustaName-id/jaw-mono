import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { rpcMethodSchema } from "../tools.js";
import { mcpError, mcpResult } from "../helpers.js";
import { getBridge } from "../../lib/bridge-singleton.js";
import { loadConfig } from "../../lib/config.js";
import type { WSBridge } from "../../lib/ws-bridge.js";

function resolveApiKey(): string {
  const apiKey = process.env["JAW_API_KEY"] ?? loadConfig().apiKey;
  if (!apiKey) {
    throw new Error(
      "API key required. Set JAW_API_KEY env var or run: jaw config set apiKey <key>",
    );
  }
  return apiKey;
}

/** Cached bridge connection — reused across sequential MCP tool calls. */
let cachedBridge: WSBridge | null = null;

async function getOrCreateBridge(chainId?: number): Promise<WSBridge> {
  // Reuse if the connection is still open
  if (cachedBridge && cachedBridge.isOpen()) {
    return cachedBridge;
  }

  const config = loadConfig();
  const apiKey = resolveApiKey();

  cachedBridge = await getBridge({
    keysUrl: config.keysUrl,
    apiKey,
    chainId: chainId ?? config.defaultChain,
    ens: config.ens,
    paymasterUrl: config.paymasterUrl,
  });

  return cachedBridge;
}

export function closeCachedBridge(): void {
  if (cachedBridge) {
    cachedBridge.close();
    cachedBridge = null;
  }
}

export function isBridgeCached(): boolean {
  return cachedBridge !== null && cachedBridge.isOpen();
}

export function registerRpcTool(server: McpServer): void {
  // @ts-expect-error — MCP SDK deep type inference with z.any() in schema
  server.tool(
    "jaw_rpc",
    "Execute any JAW.id wallet RPC method via the browser bridge. " +
      "Supports transactions, signing, permissions, and queries. " +
      "Methods that require signing will open the browser for passkey authentication. " +
      "IMPORTANT: Read the jaw://api-reference resource for the full list of methods, " +
      "and jaw://api-reference/{method} for detailed parameter formats and examples.",
    rpcMethodSchema,
    async (params) => {
      try {
        const bridge = await getOrCreateBridge(params.chainId);
        const result = await bridge.request(params.method, params.params);
        return mcpResult(result);
      } catch (err) {
        // If the connection broke, clear the cache so the next call reconnects
        if (cachedBridge && !cachedBridge.isOpen()) {
          cachedBridge = null;
        }
        return mcpError(err);
      }
    },
  );
}
