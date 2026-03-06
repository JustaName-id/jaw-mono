import { BaseCommand } from "../../base-command.js";
import { loadConfig, redactConfig } from "../../lib/config.js";

export default class ConfigShow extends BaseCommand {
  static override description = "Show current CLI configuration";

  static override examples = [
    "<%= config.bin %> config show",
    "<%= config.bin %> config show --output json",
  ];

  static override flags = {
    ...BaseCommand.baseFlags,
  };

  async run(): Promise<void> {
    const { flags } = await this.parse(ConfigShow);
    const config = loadConfig();
    this.outputResult(redactConfig(config), flags.output as "json" | "human");
  }
}
