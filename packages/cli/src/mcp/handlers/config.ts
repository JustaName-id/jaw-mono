import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { configSetSchema } from '../tools.js';
import { mcpError, mcpResult } from '../helpers.js';
import { loadConfig, setConfigValue, redactConfig } from '../../lib/config.js';
import type { SettableConfigKey } from '../../lib/types.js';

export function registerConfigTools(server: McpServer): void {
  server.registerTool(
    'jaw_config_show',
    {
      description: 'Show current CLI configuration (secrets redacted).',
      annotations: { readOnlyHint: true },
    },
    async () => {
      try {
        return mcpResult(redactConfig(loadConfig()));
      } catch (err) {
        return mcpError(err);
      }
    }
  );

  server.registerTool(
    'jaw_config_set',
    {
      description: 'Set a CLI configuration value (apiKey, defaultChain, keysUrl, ens, relayUrl, sessionExpiry).',
      inputSchema: configSetSchema,
    },
    // @ts-expect-error — MCP SDK deep type inference (TS2589) with the zod schema
    async (params: { key: SettableConfigKey; value: string }) => {
      try {
        if (params.key === 'defaultChain' || params.key === 'sessionExpiry') {
          const num = parseInt(params.value, 10);
          if (isNaN(num) || num <= 0) {
            throw new Error(`Invalid number for ${params.key}: ${params.value}`);
          }
          setConfigValue(params.key, num);
        } else {
          setConfigValue(params.key, params.value);
        }
        return {
          content: [
            {
              type: 'text' as const,
              text: `Set ${params.key} successfully`,
            },
          ],
        };
      } catch (err) {
        return mcpError(err);
      }
    }
  );
}
