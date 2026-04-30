import * as fs from 'node:fs';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { mcpError } from '../helpers.js';
import { shutdownDaemon } from '../../lib/bridge-singleton.js';
import { PATHS } from '../../lib/paths.js';
import { loadConfig, redactConfig } from '../../lib/config.js';

export function registerDaemonTools(server: McpServer): void {
  server.tool(
    'jaw_status',
    'Check the current status of the JAW.id relay bridge — whether a relay session ' +
      'exists, the bridge connection is active, and what configuration is in use.',
    {},
    async () => {
      try {
        let relaySession = false;

        try {
          if (fs.existsSync(PATHS.relay)) {
            JSON.parse(fs.readFileSync(PATHS.relay, 'utf-8'));
            relaySession = true;
          }
        } catch {
          relaySession = false;
        }

        const config = redactConfig(loadConfig());

        const status = {
          relay: relaySession ? { session: true } : { session: false },
          bridgeConnection: 'disconnected',
          config,
        };

        return {
          content: [{ type: 'text' as const, text: JSON.stringify(status, null, 2) }],
        };
      } catch (err) {
        return mcpError(err);
      }
    }
  );

  server.tool(
    'jaw_disconnect',
    'Close the relay session and browser tab. ' +
      'Call this when you are done making wallet requests to clean up resources.',
    {},
    async () => {
      try {
        await shutdownDaemon();
        return {
          content: [
            {
              type: 'text' as const,
              text: 'Relay session closed and browser tab dismissed.',
            },
          ],
        };
      } catch (err) {
        return mcpError(err);
      }
    }
  );
}
