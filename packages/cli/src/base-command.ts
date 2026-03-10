import { Command, Flags } from "@oclif/core";
import type { OutputFormat } from "./lib/types.js";
import { loadConfig } from "./lib/config.js";
import { formatOutput } from "./lib/output.js";

export abstract class BaseCommand extends Command {
  static override baseFlags = {
    output: Flags.string({
      char: "o",
      description: "Output format",
      options: ["json", "human"],
      default: "human",
      env: "JAW_OUTPUT",
    }),
    chain: Flags.integer({
      char: "c",
      description: "Chain ID",
      env: "JAW_CHAIN_ID",
    }),
    "api-key": Flags.string({
      description: "JAW API key",
      env: "JAW_API_KEY",
    }),
    yes: Flags.boolean({
      char: "y",
      description: "Skip confirmations (for AI agents)",
      default: false,
    }),
    quiet: Flags.boolean({
      char: "q",
      description: "Suppress non-essential output",
      default: false,
    }),
  };

  protected resolveApiKey(flags: { "api-key"?: string }): string {
    const apiKey = flags["api-key"] ?? loadConfig().apiKey;
    if (!apiKey) {
      this.error(
        "API key required. Set via --api-key, JAW_API_KEY env, or `jaw config set apiKey <key>`",
      );
    }
    return apiKey;
  }

  protected resolveChainId(flags: { chain?: number }): number {
    const chainId = flags.chain ?? loadConfig().defaultChain;
    if (!chainId) {
      this.error(
        "Chain ID required. Set via --chain, JAW_CHAIN_ID env, or `jaw config set defaultChain <id>`",
      );
    }
    return chainId;
  }

  protected outputResult(data: unknown, format: OutputFormat): void {
    const output = formatOutput(data, format);
    this.log(output);
  }
}
