import { Args } from "@oclif/core";
import { BaseCommand } from "../../base-command.js";
import { setConfigValue } from "../../lib/config.js";

const VALID_KEYS = [
  "apiKey",
  "defaultChain",
  "keysUrl",
  "paymasterUrl",
] as const;

export default class ConfigSet extends BaseCommand {
  static override description = "Set a configuration value";

  static override examples = [
    "<%= config.bin %> config set apiKey your-api-key",
    "<%= config.bin %> config set defaultChain 8453",
    "<%= config.bin %> config set keysUrl https://keys.jaw.id",
  ];

  static override args = {
    key: Args.string({
      description: `Config key (${VALID_KEYS.join(", ")})`,
      required: true,
      options: [...VALID_KEYS],
    }),
    value: Args.string({
      description: "Config value",
      required: true,
    }),
  };

  static override flags = {
    ...BaseCommand.baseFlags,
  };

  async run(): Promise<void> {
    const { args, flags } = await this.parse(ConfigSet);

    const key = args.key as (typeof VALID_KEYS)[number];
    const value =
      key === "defaultChain" ? parseInt(args.value, 10) : args.value;

    if (key === "defaultChain" && isNaN(value as number)) {
      this.error(`Invalid chain ID: ${args.value}`);
    }

    setConfigValue(key, value as string | number);

    const displayValue =
      key === "apiKey" && typeof value === "string"
        ? `${value.slice(0, 8)}...`
        : value;

    if (flags.output === "json") {
      this.outputResult({ key, value: displayValue }, "json");
    } else {
      this.log(`Set ${key} = ${displayValue}`);
    }
  }
}
