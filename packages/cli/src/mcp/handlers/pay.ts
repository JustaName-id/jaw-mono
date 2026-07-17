import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { payAndFetchSchema, x402LogSchema, x402BalanceSchema } from '../tools.js';
import { mcpError, mcpResult } from '../helpers.js';
import { loadConfig } from '../../lib/config.js';
import { Eip3009EoaPayer, sessionPayerAddress } from '../../x402/payer.js';
import { payAndFetch } from '../../x402/http.js';
import { appendX402Log, readX402Log } from '../../x402/ledger.js';
import { usdcBalance } from '../../x402/balance.js';
import { resolveX402Policy } from '../../x402/policy.js';

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
        'if no policy is configured, conservative default caps apply (1 USDC per payment, 10 USDC ' +
        'per session). An over-cap, wrong-asset, wrong-network, or disallowed-recipient payment is ' +
        'refused, never silently paid. Requires a session — run `jaw session setup` first ' +
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
          policy: resolveX402Policy(config.x402),
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

        // Record payment attempts (not free passthroughs) to the audit ledger.
        const settled = result.payment ?? result.attemptedPayment;
        const isPaymentEvent =
          result.paid || !!result.attemptedPayment || (result.status === 402 && !!result.refusedReason);
        if (isPaymentEvent) {
          appendX402Log({
            at: new Date().toISOString(),
            url: params.url,
            payer: result.payer,
            status: result.paid ? 'paid' : result.attemptedPayment ? 'failed' : 'refused',
            amount: settled?.amount,
            asset: settled?.asset,
            network: settled?.network,
            payTo: settled?.payTo,
            nonce: settled?.nonce,
            txHash: result.payment?.txHash,
            reason: result.refusedReason,
          });
        }

        return mcpResult(result);
      } catch (err) {
        return mcpError(err);
      }
    }
  );

  server.registerTool(
    'jaw_x402_log',
    {
      description:
        'Read the local x402 payment ledger — every jaw_pay_and_fetch attempt (paid, failed, or ' +
        'refused) with amount, asset, network, payTo, nonce, and txHash. Use it to audit spend or ' +
        'reconcile an ambiguous settlement by nonce. Pass limit to get only the most recent entries.',
      inputSchema: x402LogSchema,
      annotations: { readOnlyHint: true },
    },
    async (params: { limit?: number }) => {
      try {
        return mcpResult(readX402Log(params.limit));
      } catch (err) {
        return mcpError(err);
      }
    }
  );

  server.registerTool(
    'jaw_x402_balance',
    {
      description:
        'Read the session payer EOA’s USDC balance on a network, so you can tell whether a payment ' +
        'is affordable before calling jaw_pay_and_fetch, or confirm one landed after. Defaults to the ' +
        'first allowed network in the x402 config, else Base. Requires a session (jaw session setup).',
      inputSchema: x402BalanceSchema,
      annotations: { readOnlyHint: true },
    },
    async (params: { network?: string }) => {
      try {
        const config = loadConfig();
        const network = params.network ?? config.x402?.allowedNetworks?.[0] ?? 'eip155:8453';
        const payer = sessionPayerAddress();
        return mcpResult({ payer, ...(await usdcBalance(network, payer)) });
      } catch (err) {
        return mcpError(err);
      }
    }
  );
}
