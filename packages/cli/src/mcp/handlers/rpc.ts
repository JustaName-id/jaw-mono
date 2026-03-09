import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { rpcMethodSchema } from "../tools.js";
import { CLICommunicator } from "../../lib/cli-communicator.js";
import { fetchJawRpc } from "../../lib/rpc-client.js";
import { classifyMethod, SUPPORTED_METHODS } from "../../lib/rpc-classifier.js";
import { loadConfig } from "../../lib/config.js";
import { loadSession } from "../../lib/session-store.js";
import {
  handleLocalOnly,
  maybeSaveSession,
} from "../../lib/session-helpers.js";

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
        const method = params.method;
        const rpcParams = params.params;

        if (!SUPPORTED_METHODS.includes(method)) {
          return mcpError(
            new Error(
              `Unsupported method: ${method}. Supported: ${SUPPORTED_METHODS.join(", ")}`,
            ),
          );
        }

        const category = classifyMethod(method);

        if (category === "local-only") {
          const normalized = rpcParams
            ? Array.isArray(rpcParams)
              ? rpcParams
              : [rpcParams]
            : undefined;
          return mcpResult(handleLocalOnly(method, normalized));
        }

        if (category === "read-only") {
          const result = await handleReadOnlyMethod(method, rpcParams);
          return mcpResult(result);
        }

        // Signing + session-management methods: open browser
        const config = loadConfig();
        const apiKey = resolveApiKey();
        const communicator = new CLICommunicator({
          keysUrl: config.keysUrl,
          apiKey,
        });

        const result = await communicator.request(method, rpcParams);
        maybeSaveSession(method, result, params.chainId);

        return mcpResult(result);
      } catch (err) {
        return mcpError(err);
      }
    },
  );
}

async function handleReadOnlyMethod(
  method: string,
  params: unknown,
): Promise<unknown> {
  const config = loadConfig();

  switch (method) {
    case "eth_accounts": {
      const session = loadSession();
      return session ? [session.address] : [];
    }
    case "eth_chainId": {
      const chainId = config.defaultChain ?? 1;
      return `0x${chainId.toString(16)}`;
    }
    case "net_version": {
      return String(config.defaultChain ?? 1);
    }
    case "wallet_getCallsStatus":
    case "wallet_getCallsHistory":
    case "wallet_getAssets":
    case "wallet_getCapabilities":
    case "wallet_getPermissions": {
      const apiKey = resolveApiKey();
      const session = loadSession();
      const rpcParams = buildReadOnlyParams(method, params, session?.address);
      return fetchJawRpc(method, rpcParams, apiKey);
    }
    default:
      throw new Error(`Unhandled read-only method: ${method}`);
  }
}

function buildReadOnlyParams(
  method: string,
  params: unknown,
  address?: string,
): unknown[] {
  if (params !== undefined) {
    return Array.isArray(params) ? params : [params];
  }

  switch (method) {
    case "wallet_getAssets":
      return address ? [{ account: address }] : [];
    case "wallet_getCapabilities":
      return address ? [address] : [];
    case "wallet_getPermissions":
      return address ? [{ address }] : [];
    case "wallet_getCallsHistory":
      return address ? [{ address }] : [];
    default:
      return [];
  }
}
