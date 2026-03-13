import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { configSetSchema } from "../tools.js";
import { mcpError } from "../helpers.js";
import { loadConfig, setConfigValue, redactConfig } from "../../lib/config.js";

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
    "Set a CLI configuration value (apiKey, defaultChain, keysUrl, paymasterUrl, ens, relayUrl).",
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
