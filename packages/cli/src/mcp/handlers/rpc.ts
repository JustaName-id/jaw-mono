import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { rpcMethodSchema } from "../tools.js";
import { getBridge } from "../../lib/bridge-singleton.js";
import { loadConfig } from "../../lib/config.js";

function mcpError(err: unknown) {
  return {
    isError: true as const,
    content: [
      {
        type: "text" as const,
        text: `Error: ${err instanceof Error ? err.message : String(err)}`,
      },
    ],
  };
}

function mcpResult(data: unknown) {
  return {
    content: [
      {
        type: "text" as const,
        text: JSON.stringify(data),
      },
    ],
  };
}

function resolveApiKey(): string {
  const apiKey = process.env["JAW_API_KEY"] ?? loadConfig().apiKey;
  if (!apiKey) {
    throw new Error(
      "API key required. Set JAW_API_KEY env var or run: jaw config set apiKey <key>",
    );
  }
  return apiKey;
}

export function registerRpcTool(server: McpServer): void {
  // @ts-expect-error — MCP SDK deep type inference with z.any() in schema
  server.tool(
    "jaw_rpc",
    "Execute any JAW.id wallet RPC method. Supports all EIP-1193 methods including " +
      "transactions (wallet_sendCalls), signing (personal_sign, eth_signTypedData_v4), " +
      "permissions (wallet_grantPermissions), account management (wallet_connect), and queries " +
      "(wallet_getAssets, wallet_getCallsStatus). Methods that require signing will open " +
      "the browser for passkey authentication via keys.jaw.id. " +
      "Full reference: https://docs.jaw.id/api-reference",
    rpcMethodSchema,
    async (params) => {
      try {
        const config = loadConfig();
        const apiKey = resolveApiKey();

        const bridge = await getBridge({
          keysUrl: config.keysUrl,
          apiKey,
          chainId: params.chainId ?? config.defaultChain,
          ens: config.ens,
          paymasterUrl: config.paymasterUrl,
        });

        try {
          const result = await bridge.request(params.method, params.params);
          return mcpResult(result);
        } finally {
          bridge.close();
        }
      } catch (err) {
        return mcpError(err);
      }
    },
  );
}
