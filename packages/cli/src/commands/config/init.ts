import { Flags } from "@oclif/core";
import { BaseCommand } from "../../base-command.js";
import { initConfig, redactConfig } from "../../lib/config.js";
import { PATHS } from "../../lib/paths.js";

export default class ConfigInit extends BaseCommand {
  static override description = "Initialize JAW CLI configuration";

  static override examples = [
    "<%= config.bin %> config init",
    "<%= config.bin %> config init --api-key your-key --chain 8453",
  ];

  static override flags = {
    ...BaseCommand.baseFlags,
    chain: Flags.integer({
      char: "c",
      description: "Default chain ID",
      env: "JAW_CHAIN_ID",
    }),
  };

  async run(): Promise<void> {
    const { flags } = await this.parse(ConfigInit);

    const config = initConfig({
      apiKey: flags["api-key"],
      defaultChain: flags.chain,
    });

    if (flags.output === "json") {
      this.outputResult(redactConfig(config), "json");
    } else {
      this.log(`Configuration initialized at ${PATHS.config}`);
      if (config.apiKey) this.log(`  API key: ${config.apiKey.slice(0, 8)}...`);
      if (config.defaultChain)
        this.log(`  Default chain: ${config.defaultChain}`);
    }
  }
}
