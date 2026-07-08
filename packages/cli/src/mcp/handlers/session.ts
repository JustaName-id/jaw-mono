import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { mcpError, mcpResult } from '../helpers.js';
import { keystoreExists } from '../../lib/keystore.js';
import { loadSessionConfig } from '../../lib/session-config.js';

export function registerSessionTools(server: McpServer): void {
  server.registerTool(
    'jaw_session_status',
    {
      description:
        'Show the local session-key (auto mode) status — session address, owner, permission ID, ' +
        'chain, and expiry. When a valid session exists, jaw_rpc can sign autonomously with ' +
        'session: true instead of opening the browser. Sessions are created with `jaw session setup` ' +
        'in a terminal (requires a one-time browser passkey approval).',
      annotations: { readOnlyHint: true },
    },
    async () => {
      try {
        if (!keystoreExists()) {
          return mcpResult({
            exists: false,
            hint: 'No session key. Ask the user to run `jaw session setup` in a terminal to enable autonomous signing.',
          });
        }
        const config = loadSessionConfig();
        return mcpResult({
          exists: true,
          ...config,
          expired: config.expiry <= Date.now() / 1000,
        });
      } catch (err) {
        return mcpError(err);
      }
    }
  );
}
