import { type McpServer, ResourceTemplate } from '@modelcontextprotocol/sdk/server/mcp.js';

const DOCS_BASE = 'https://docs.jaw.id/api-reference';

const FETCH_TIMEOUT_MS = 15_000;

async function fetchDocs(url: string): Promise<string> {
  const res = await fetch(url, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
  if (!res.ok) {
    throw new Error(`Failed to fetch docs: ${res.status} ${res.statusText}`);
  }
  const html = await res.text();
  // Strip HTML tags for a readable text representation.
  // MCP resources are consumed by LLMs, so plain text is ideal.
  return html
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s{2,}/g, ' ')
    .trim();
}

const X402_GUIDE = `JAW x402 payments — paying for HTTP resources with USDC, no browser.

WHAT IT IS
An HTTP server can answer a request with "402 Payment Required". These tools let
you pay that automatically from the JAW wallet's session key and get the resource.

TOOLS
- jaw_pay_and_fetch { url, method?, headers?, body?, maxAmount?, asset?, network? }
  Fetches the URL. If it is free (not 402), returns it as-is. If it answers 402,
  pays with USDC (EIP-3009) and retries. Returns { paid, status, body, payer,
  payment? { amount, asset, network, payTo, nonce, txHash }, attemptedPayment?,
  refusedReason? }.
- jaw_x402_balance { network? }  -> the payer EOA's USDC balance on that network.
  Check this before paying to know if you can afford it.
- jaw_x402_log { limit? }  -> the local ledger of every payment attempt.
- jaw_session_status  -> includes payerAddress, the EOA that pays.

FUNDING
The payer is the session-key EOA shown as payerAddress in jaw_session_status.
It is NOT the smart-account (session) address. Send USDC to payerAddress on the
network you will pay on (e.g. Base, or Base Sepolia for testing). Payments are
gasless for the payer (the facilitator pays the gas), so it only needs USDC, no
native token. If a payment fails with an insufficient-balance reason, top up
payerAddress.

LIMITS
Every payment is bounded by a policy plus the per-call maxAmount. If nothing is
configured, conservative defaults apply: 1 USDC per payment and 10 USDC per
session. Configure limits from a terminal with jaw config set x402.<field>
(maxAmountPerPayment, maxTotalPerSession, allowedAssets, allowedNetworks,
allowedHosts, allowedPayTo). These cannot be changed through the tools, only by a
human at the CLI. A payment over a cap, or to a disallowed asset/network/host/
recipient, is refused rather than paid.

FLOW
fetch url -> 402? -> within caps? -> sign USDC with the session key -> facilitator
settles on-chain -> resource. Free URLs pass straight through. Over a cap it is
refused. All amounts are in base units (USDC has 6 decimals: 1000000 = 1 USDC).`;

export function registerResources(server: McpServer): void {
  // Self-contained guide to the x402 payment tools + funding + limits.
  server.registerResource(
    'x402-guide',
    'jaw://x402',
    {
      description:
        'How to pay for HTTP resources with x402 (USDC): the jaw_pay_and_fetch / jaw_x402_balance / ' +
        'jaw_x402_log tools, how to fund the payer, and the spending limits. Read this before paying.',
      mimeType: 'text/plain',
    },
    async () => ({
      contents: [{ uri: 'jaw://x402', mimeType: 'text/plain', text: X402_GUIDE }],
    })
  );

  // Overview of all RPC methods
  server.registerResource(
    'api-reference',
    'jaw://api-reference',
    {
      description:
        'JAW.id API reference — lists all supported RPC methods with descriptions. ' +
        'Read this before using the jaw_rpc tool to understand available methods.',
      mimeType: 'text/plain',
    },
    async () => ({
      contents: [
        {
          uri: 'jaw://api-reference',
          mimeType: 'text/plain',
          text: await fetchDocs(DOCS_BASE),
        },
      ],
    })
  );

  // Per-method documentation with parameter details
  server.registerResource(
    'api-reference-method',
    new ResourceTemplate('jaw://api-reference/{method}', { list: undefined }),
    {
      description:
        'Detailed documentation for a specific RPC method including parameters, ' +
        'request/response format, and examples. Use the method name from the ' +
        'api-reference overview (e.g. wallet_sendCalls, personal_sign).',
      mimeType: 'text/plain',
    },
    async (uri, variables) => {
      const method = String(variables.method);

      // Validate method name to prevent path traversal (e.g. ../../admin)
      if (!/^[\w_]+$/.test(method)) {
        throw new Error(`Invalid method name: "${method}". Expected an RPC method like wallet_sendCalls.`);
      }

      return {
        contents: [
          {
            uri: uri.href,
            mimeType: 'text/plain',
            text: await fetchDocs(`${DOCS_BASE}/${method}`),
          },
        ],
      };
    }
  );
}
