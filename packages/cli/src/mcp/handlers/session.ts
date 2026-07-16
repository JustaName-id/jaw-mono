import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { mcpError, mcpResult } from '../helpers.js';
import { keystoreExists } from '../../lib/keystore.js';
import { loadSessionConfig } from '../../lib/session-config.js';
import { sessionPayerAddress } from '../../x402/payer.js';

export function registerSessionTools(server: McpServer): void {
  server.registerTool(
    'jaw_session_status',
    {
      description:
        'Show the local session-key (auto mode) status — session address, owner, permission ID, ' +
        'chain, expiry, and the x402 payer address. When a valid session exists, jaw_rpc can sign ' +
        'autonomously with session: true instead of opening the browser. Sessions are created with ' +
        '`jaw session setup` in a terminal (requires a one-time browser passkey approval).',
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
        // The EOA that jaw_pay_and_fetch pays USDC from — distinct from
        // sessionAddress (the smart account). This is the address to fund.
        // Non-fatal: a malformed key must not break the whole status report.
        let payerAddress: string | undefined;
        try {
          payerAddress = sessionPayerAddress();
        } catch {
          payerAddress = undefined;
        }
        return mcpResult({
          exists: true,
          ...config,
          expired: config.expiry <= Date.now() / 1000,
          ...(payerAddress ? { payerAddress } : {}),
        });
      } catch (err) {
        return mcpError(err);
      }
    }
  );
}
