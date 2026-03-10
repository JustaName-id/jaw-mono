import { BaseCommand } from "../../base-command.js";
import { setConfigValue } from "../../lib/config.js";

const VALID_KEYS = [
  "apiKey",
  "defaultChain",
  "keysUrl",
  "paymasterUrl",
  "ens",
] as const;

type ValidKey = (typeof VALID_KEYS)[number];

function isValidKey(key: string): key is ValidKey {
  return VALID_KEYS.includes(key as ValidKey);
}

export default class ConfigSet extends BaseCommand {
  static override description =
    "Set one or more configuration values. Accepts key=value pairs or a single key value.";

  static override examples = [
    "<%= config.bin %> config set apiKey=your-api-key defaultChain=8453",
    "<%= config.bin %> config set ens=yourdomain.eth paymasterUrl=https://your-paymaster.com",
    "<%= config.bin %> config set apiKey your-api-key",
  ];

  static override strict = false;

  static override args = {};

  static override flags = {
    ...BaseCommand.baseFlags,
  };

  async run(): Promise<void> {
    const { argv, flags } = await this.parse(ConfigSet);
    const rawArgs = argv as string[];

    // Parse key=value pairs from all args
    const entries = this.parseEntries(rawArgs);

    if (entries.length === 0) {
      this.error(
        `No valid key=value pairs provided.\nValid keys: ${VALID_KEYS.join(", ")}\nUsage: jaw config set key=value [key=value ...]`,
      );
    }

    const results: { key: string; value: string | number }[] = [];

    for (const { key, value } of entries) {
      const parsed = key === "defaultChain" ? parseInt(value, 10) : value;

      if (key === "defaultChain" && isNaN(parsed as number)) {
        this.error(`Invalid chain ID: ${value}`);
      }

      setConfigValue(key, parsed as string | number);

      const displayValue =
        key === "apiKey" && typeof value === "string"
          ? `${value.slice(0, 8)}...`
          : parsed;

      results.push({ key, value: displayValue });
    }

    if (flags.output === "json") {
      this.outputResult(
        results.length === 1 ? results[0] : results,
        "json",
      );
    } else {
      for (const { key, value } of results) {
        this.log(`Set ${key} = ${value}`);
      }
    }
  }

  private parseEntries(
    rawArgs: string[],
  ): { key: ValidKey; value: string }[] {
    const entries: { key: ValidKey; value: string }[] = [];

    let i = 0;
    while (i < rawArgs.length) {
      const arg = rawArgs[i];

      if (arg.includes("=")) {
        // key=value syntax
        const eqIndex = arg.indexOf("=");
        const key = arg.slice(0, eqIndex);
        const value = arg.slice(eqIndex + 1);

        if (!isValidKey(key)) {
          this.error(
            `Invalid config key: ${key}\nValid keys: ${VALID_KEYS.join(", ")}`,
          );
        }
        entries.push({ key, value });
        i++;
      } else if (isValidKey(arg) && i + 1 < rawArgs.length) {
        // key value syntax (legacy)
        entries.push({ key: arg, value: rawArgs[i + 1] });
        i += 2;
      } else {
        this.error(
          `Unexpected argument: ${arg}\nUsage: jaw config set key=value [key=value ...]`,
        );
      }
    }

    return entries;
  }
}