import { BaseCommand } from '../../base-command.js';
import { setConfigValue, setX402PolicyValue } from '../../lib/config.js';
import { isX402PolicyKey } from '../../x402/policy.js';

const VALID_KEYS = ['apiKey', 'defaultChain', 'keysUrl', 'ens', 'relayUrl', 'sessionExpiry'] as const;

type ValidKey = (typeof VALID_KEYS)[number];

function isValidKey(key: string): key is ValidKey {
  return VALID_KEYS.includes(key as ValidKey);
}

// x402 policy fields are addressed as `x402.<field>` (e.g. x402.maxAmountPerPayment).
// Array fields take a comma-separated value. This lives on the CLI only — the MCP
// tool cannot set the policy, so an agent cannot widen its own spending caps.
function isSettableKey(key: string): boolean {
  return isValidKey(key) || (key.startsWith('x402.') && isX402PolicyKey(key.slice('x402.'.length)));
}

export default class ConfigSet extends BaseCommand {
  static override description = 'Set one or more configuration values. Accepts key=value pairs or a single key value.';

  static override examples = [
    '<%= config.bin %> config set apiKey=your-api-key defaultChain=8453',
    '<%= config.bin %> config set ens=yourdomain.eth sessionExpiry=14',
    '<%= config.bin %> config set apiKey your-api-key',
    '<%= config.bin %> config set x402.maxAmountPerPayment=50000 x402.maxTotalPerSession=1000000',
    '<%= config.bin %> config set x402.allowedNetworks=eip155:8453,eip155:84532',
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
        `No valid key=value pairs provided.\nValid keys: ${VALID_KEYS.join(', ')}\nUsage: jaw config set key=value [key=value ...]`
      );
    }

    const results: { key: string; value: string | number }[] = [];

    for (const { key, value } of entries) {
      if (key.startsWith('x402.')) {
        const sub = key.slice('x402.'.length);
        if (!isX402PolicyKey(sub)) {
          this.error(`Invalid x402 config key: ${sub}`);
        }
        setX402PolicyValue(sub, value);
        results.push({ key, value });
        continue;
      }

      if (!isValidKey(key)) {
        this.error(`Invalid config key: ${key}`);
      }
      const parsed = key === 'defaultChain' || key === 'sessionExpiry' ? parseInt(value, 10) : value;

      if ((key === 'defaultChain' || key === 'sessionExpiry') && isNaN(parsed as number)) {
        this.error(`Invalid number for ${key}: ${value}`);
      }

      setConfigValue(key, parsed as string | number);

      const displayValue = key === 'apiKey' && typeof value === 'string' ? `${value.slice(0, 8)}...` : parsed;

      results.push({ key, value: displayValue });
    }

    if (flags.output === 'json') {
      this.outputResult(results.length === 1 ? results[0] : results, 'json');
    } else {
      for (const { key, value } of results) {
        this.log(`Set ${key} = ${value}`);
      }
    }
  }

  private parseEntries(rawArgs: string[]): { key: string; value: string }[] {
    const entries: { key: string; value: string }[] = [];
    const validKeysHint = `Valid keys: ${VALID_KEYS.join(', ')}, x402.<maxAmountPerPayment|maxTotalPerSession|allowedAssets|allowedNetworks|allowedHosts|allowedPayTo>`;

    let i = 0;
    while (i < rawArgs.length) {
      const arg = rawArgs[i];

      if (arg.includes('=')) {
        // key=value syntax
        const eqIndex = arg.indexOf('=');
        const key = arg.slice(0, eqIndex);
        const value = arg.slice(eqIndex + 1);

        if (!isSettableKey(key)) {
          this.error(`Invalid config key: ${key}\n${validKeysHint}`);
        }
        entries.push({ key, value });
        i++;
      } else if (isSettableKey(arg) && i + 1 < rawArgs.length) {
        // key value syntax (legacy)
        entries.push({ key: arg, value: rawArgs[i + 1] });
        i += 2;
      } else {
        this.error(`Unexpected argument: ${arg}\nUsage: jaw config set key=value [key=value ...]`);
      }
    }

    return entries;
  }
}
