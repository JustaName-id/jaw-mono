import { Args, Flags } from '@oclif/core';
import { BaseCommand } from '../../base-command.js';
import { getBridge } from '../../lib/bridge-singleton.js';
import { loadConfig } from '../../lib/config.js';
import { requiresBrowser } from '../../lib/rpc-classifier.js';
import { SessionBridge } from '../../lib/session-bridge.js';
import type { OutputFormat } from '../../lib/types.js';

export default class RpcCall extends BaseCommand {
  static override description = 'Execute any JAW.id RPC method via the browser bridge or local session key.';

  static override examples = [
    '<%= config.bin %> rpc call wallet_sendCalls \'{"calls":[{"to":"0x...","value":"0x0"}]}\'',
    '<%= config.bin %> rpc call personal_sign \'"Hello World"\'',
    '<%= config.bin %> rpc call wallet_getAssets',
    '<%= config.bin %> rpc call eth_requestAccounts',
    '<%= config.bin %> rpc call wallet_getCallsStatus \'"0x..."\'',
    '<%= config.bin %> rpc call wallet_sendCalls \'{"calls":[...]}\' --session',
  ];

  static override args = {
    method: Args.string({
      description: 'EIP-1193 RPC method name',
      required: true,
    }),
    params: Args.string({
      description: 'Method parameters as JSON string',
      required: false,
    }),
  };

  static override flags = {
    ...BaseCommand.baseFlags,
    timeout: Flags.integer({
      char: 't',
      description: 'Request timeout in seconds',
      default: 120,
    }),
  };

  async run(): Promise<void> {
    const { args, flags } = await this.parse(RpcCall);
    const { method } = args;

    let params: unknown;
    if (args.params) {
      try {
        params = JSON.parse(args.params);
      } catch {
        this.error(`Invalid JSON params: ${args.params}`);
      }
    }

    const format = flags.output as OutputFormat;
    const config = loadConfig();
    const apiKey = this.resolveApiKey(flags);
    const chainId = flags.chain ?? config.defaultChain ?? 1;

    let bridge: { request(method: string, params?: unknown): Promise<unknown>; close(): void };

    if (flags.session) {
      bridge = new SessionBridge({ apiKey, chainId });

      if (!flags.quiet) {
        this.log(`Sending ${method} (session mode)...`);
      }
    } else {
      const pm = config.paymasters?.[chainId];
      bridge = await getBridge({
        keysUrl: config.keysUrl,
        apiKey,
        chainId,
        ens: config.ens,
        paymasterUrl: pm?.url,
        timeout: flags.timeout * 1000,
      });

      if (!flags.quiet) {
        if (requiresBrowser(method)) {
          this.log(`Sending ${method}... Check your browser to approve the request.`);
        } else {
          this.log(`Sending ${method}...`);
        }
      }
    }

    try {
      const result = await bridge.request(method, params);
      this.outputResult(result, format);
    } finally {
      bridge.close();
    }
  }
}
