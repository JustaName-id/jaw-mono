import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { configSetSchema } from "../tools.js";
import { loadConfig, setConfigValue, redactConfig } from "../../lib/config.js";

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

export function registerConfigTools(server: McpServer): void {
  server.tool(
    "jaw_config_show",
    "Show current CLI configuration (API key redacted).",
    {},
    async () => {
      try {
        const config = redactConfig(loadConfig());
        return {
          content: [
            { type: "text" as const, text: JSON.stringify(config) },
          ],
        };
      } catch (err) {
        return mcpError(err);
      }
    },
  );

  server.tool(
    "jaw_config_set",
    "Set a CLI configuration value (apiKey, defaultChain, keysUrl, paymasterUrl).",
    configSetSchema,
    async (params) => {
      try {
        if (params.key === "defaultChain") {
          const num = parseInt(params.value, 10);
          if (isNaN(num) || num <= 0) {
            throw new Error(`Invalid chain ID: ${params.value}`);
          }
          setConfigValue(params.key, num);
        } else {
          setConfigValue(params.key, params.value);
        }
        return {
          content: [
            {
              type: "text" as const,
              text: `Set ${params.key} successfully`,
            },
          ],
        };
      } catch (err) {
        return mcpError(err);
      }
    },
  );
}
