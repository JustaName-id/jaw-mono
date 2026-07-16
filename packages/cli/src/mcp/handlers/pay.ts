import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { payAndFetchSchema } from '../tools.js';
import { mcpError, mcpResult } from '../helpers.js';
import { loadConfig } from '../../lib/config.js';
import { Eip3009EoaPayer } from '../../x402/payer.js';
import { payAndFetch } from '../../x402/http.js';

interface PayAndFetchParams {
  url: string;
  method?: string;
  headers?: Record<string, string>;
  body?: string;
  maxAmount?: string;
  asset?: string;
  network?: string;
}

export function registerPayTool(server: McpServer): void {
  // Cumulative spend for this process, enforced against the policy's
  // maxTotalPerSession so an agent cannot chain many small payments past the cap.
  let sessionSpent = 0n;

  server.registerTool(
    'jaw_pay_and_fetch',
    {
      description:
        'Fetch an HTTP resource, automatically paying an x402 `402` challenge with the local ' +
        'session key when one appears (USDC via EIP-3009, no browser). Free resources pass ' +
        'straight through, so this also works as a plain fetch. Every payment is bounded by the ' +
        '`x402` policy in config (see jaw_config_show) and the optional `maxAmount` for this call; ' +
        'an over-cap, wrong-asset, wrong-network, or disallowed-recipient payment is refused, ' +
        'never silently paid. Requires a session — run `jaw session setup` first ' +
        '(check jaw_session_status).',
      inputSchema: payAndFetchSchema,
    },
    // @ts-expect-error — MCP SDK deep type inference with z.record in the schema
    async (params: PayAndFetchParams) => {
      try {
        const config = loadConfig();
        // Throws a clear "run jaw session setup" error when no session exists.
        const payer = Eip3009EoaPayer.fromSessionKey();

        const result = await payAndFetch(params.url, payer, {
          method: params.method,
          headers: params.headers,
          body: params.body,
          policy: config.x402 ?? {},
          spentThisSession: sessionSpent,
          maxAmount: params.maxAmount,
          asset: params.asset,
          network: params.network,
        });

        if (result.paid && result.payment) {
          try {
            sessionSpent += BigInt(result.payment.amount);
          } catch {
            /* non-numeric amount can't move the accumulator; ignore */
          }
        }

        return mcpResult(result);
      } catch (err) {
        return mcpError(err);
      }
    }
  );
}
