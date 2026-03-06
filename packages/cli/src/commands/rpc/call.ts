import { Args, Flags } from "@oclif/core";
import { BaseCommand } from "../../base-command.js";
import { CLICommunicator } from "../../lib/cli-communicator.js";
import {
  classifyMethod,
  needsBrowser,
  SUPPORTED_METHODS,
} from "../../lib/rpc-classifier.js";
import { loadSession } from "../../lib/session-store.js";
import { loadConfig } from "../../lib/config.js";
import {
  handleLocalOnly,
  maybeSaveSession,
} from "../../lib/session-helpers.js";
import type { OutputFormat } from "../../lib/types.js";

export default class RpcCall extends BaseCommand {
  static override description =
    "Execute any JAW.id RPC method. Opens browser for signing methods.";

  static override examples = [
    '<%= config.bin %> rpc call wallet_sendCalls \'{"calls":[{"to":"0x...","value":"0x0"}]}\'',
    "<%= config.bin %> rpc call personal_sign '\"Hello World\"'",
    "<%= config.bin %> rpc call wallet_getAssets",
    "<%= config.bin %> rpc call eth_requestAccounts",
    '<%= config.bin %> rpc call wallet_getCallsStatus \'{"id":"0x..."}\'',
  ];

  static override args = {
    method: Args.string({
      description: "EIP-1193 RPC method name",
      required: true,
    }),
    params: Args.string({
      description: "Method parameters as JSON string",
      required: false,
    }),
  };

  static override flags = {
    ...BaseCommand.baseFlags,
    timeout: Flags.integer({
      char: "t",
      description: "Browser callback timeout in seconds",
      default: 120,
    }),
    headless: Flags.boolean({
      description:
        "Use device code flow instead of browser (for SSH/headless environments)",
      default: false,
    }),
  };

  async run(): Promise<void> {
    const { args, flags } = await this.parse(RpcCall);
    const { method } = args;

    if (!SUPPORTED_METHODS.includes(method)) {
      this.error(
        `Unsupported method: ${method}\nSupported: ${SUPPORTED_METHODS.join(", ")}`,
      );
    }

    let params: unknown;
    if (args.params) {
      try {
        params = JSON.parse(args.params);
      } catch {
        this.error(`Invalid JSON params: ${args.params}`);
      }
    }

    const format = flags.output as OutputFormat;
    const category = classifyMethod(method);

    // Local-only methods (no browser needed)
    if (category === "local-only") {
      const result = handleLocalOnly(method);
      this.outputResult(result, format);
      return;
    }

    if (!needsBrowser(method)) {
      const result = await this.handleReadOnly(method, params, flags);
      this.outputResult(result, format);
      return;
    }

    // Signing/session methods — open browser (or device code for headless)
    const apiKey = this.resolveApiKey(flags);
    const config = loadConfig();

    const { isHeadlessEnvironment } = await import("../../lib/device-code.js");
    const useHeadless = flags.headless || isHeadlessEnvironment();

    if (useHeadless) {
      if (!flags.quiet) {
        this.log(`Using device code flow for ${method}...`);
      }
    } else if (!flags.quiet) {
      this.log(`Opening browser for ${method}...`);
    }

    const log = this.log.bind(this);
    const communicator = new CLICommunicator({
      keysUrl: config.keysUrl,
      apiKey,
      timeout: flags.timeout * 1000,
      headless: useHeadless,
      onDisplayCode: (userCode, verificationUrl) => {
        log("");
        log(`  Go to: ${verificationUrl}`);
        log(`  Enter code: ${userCode}`);
        log("");
        log("  Waiting for authentication...");
      },
    });

    const result = await communicator.request(method, params);

    // Save session after successful connect
    maybeSaveSession(method, result, flags.chain);

    this.outputResult(result, format);
  }

  private async handleReadOnly(
    method: string,
    params: unknown,
    flags: { chain?: number },
  ): Promise<unknown> {
    const config = loadConfig();
    const chainId = flags.chain ?? config.defaultChain ?? 1;

    switch (method) {
      case "eth_accounts": {
        const session = loadSession();
        return session ? [session.address] : [];
      }
      case "eth_chainId":
        return `0x${chainId.toString(16)}`;
      case "net_version":
        return String(chainId);
      case "wallet_getCallsStatus":
      case "wallet_getCallsHistory":
      case "wallet_getAssets":
      case "wallet_getCapabilities":
      case "wallet_getPermissions": {
        // These read-only methods still need API access
        const apiKey = this.resolveApiKey(flags as Record<string, unknown>);
        const communicator = new CLICommunicator({
          keysUrl: config.keysUrl,
          apiKey,
        });
        return communicator.request(method, params);
      }
      default:
        throw new Error(`Unhandled read-only method: ${method}`);
    }
  }
}
