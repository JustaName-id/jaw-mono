import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { rpcMethodSchema } from '../tools.js';
import { mcpError, mcpResult } from '../helpers.js';
import { getBridge } from '../../lib/bridge-singleton.js';
import { SessionBridge } from '../../lib/session-bridge.js';
import { supportsSessionMode } from '../../lib/rpc-classifier.js';
import { loadConfig } from '../../lib/config.js';
import type { JawConfig } from '../../lib/types.js';

function resolveApiKey(config: JawConfig): string {
  const apiKey = process.env['JAW_API_KEY'] ?? config.apiKey;
  if (!apiKey) {
    throw new Error('API key required. Set JAW_API_KEY env var or run: jaw config set apiKey <key>');
  }
  return apiKey;
}

function resolveChainId(paramChainId: number | undefined, config: JawConfig): number {
  if (paramChainId) return paramChainId;
  const envChainId = parseInt(process.env['JAW_CHAIN_ID'] ?? '', 10);
  if (Number.isInteger(envChainId) && envChainId > 0) return envChainId;
  return config.defaultChain ?? 1;
}

function envSessionEnabled(): boolean {
  const value = process.env['JAW_SESSION']?.toLowerCase();
  return value === '1' || value === 'true';
}

// Autonomous sends have no per-call human confirmation, so a prompt-injected
// agent could burst them. The window slows that down; it is not what bounds it.
// The bound is `JustaPermissionManager`, which meters every send against the
// period allowance on chain. Being per-process, a second server or a restart
// starts a fresh window, which is another reason not to read this as a cap.
const SIGN_RATE_WINDOW_MS = 60_000;
const MAX_SIGNS_PER_WINDOW = 5;
const SESSION_SIGNING_METHODS = ['wallet_sendCalls'];

export function registerRpcTool(server: McpServer): void {
  // Per-server (per-process) sliding window over recent autonomous signs.
  const recentSigns: number[] = [];
  function assertUnderSignLimit(): void {
    const now = Date.now();
    while (recentSigns.length && now - recentSigns[0] > SIGN_RATE_WINDOW_MS) recentSigns.shift();
    if (recentSigns.length >= MAX_SIGNS_PER_WINDOW) {
      throw new Error('Autonomous signing rate limit reached, retry shortly or call again with session: false.');
    }
    recentSigns.push(now);
  }

  server.registerTool(
    'jaw_rpc',
    {
      description:
        'Execute any JAW.id wallet RPC method. ' +
        'Supports transactions, signing, permissions, and queries. ' +
        'By default, methods that require signing open the browser for passkey authentication. ' +
        'Pass session: true to sign autonomously with the local session key instead ' +
        '(requires a session created via `jaw session setup` — check jaw_session_status). ' +
        'IMPORTANT: Read the jaw://api-reference resource for the full list of methods, ' +
        'and jaw://api-reference/{method} for detailed parameter formats and examples.',
      inputSchema: rpcMethodSchema,
    },
    // @ts-expect-error — MCP SDK deep type inference with z.any() in schema
    async (params: { method: string; params?: unknown; chainId?: number; session?: boolean }) => {
      try {
        const config = loadConfig();
        const apiKey = resolveApiKey(config);
        const chainId = resolveChainId(params.chainId, config);
        const useSession = params.session ?? envSessionEnabled();

        let bridge: { request(method: string, params?: unknown): Promise<unknown>; close(): void };

        if (useSession) {
          if (!supportsSessionMode(params.method)) {
            throw new Error(
              `Method ${params.method} is not supported in session mode. ` +
                'Call again with session: false to route through the browser bridge.'
            );
          }
          if (SESSION_SIGNING_METHODS.includes(params.method)) {
            assertUnderSignLimit();
          }
          bridge = new SessionBridge({ apiKey, chainId });
        } else {
          bridge = await getBridge({
            keysUrl: config.keysUrl,
            apiKey,
            chainId,
            ens: config.ens,
          });
        }

        try {
          const result = await bridge.request(params.method, params.params);
          return mcpResult(result);
        } finally {
          bridge.close();
        }
      } catch (err) {
        return mcpError(err);
      }
    }
  );
}
