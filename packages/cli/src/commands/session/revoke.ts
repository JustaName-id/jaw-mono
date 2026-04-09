import { BaseCommand } from '../../base-command.js';
import { loadConfig } from '../../lib/config.js';
import { getBridge } from '../../lib/bridge-singleton.js';
import { deleteKeystore, keystoreExists } from '../../lib/keystore.js';
import { loadSessionConfig, deleteSessionConfig } from '../../lib/session-config.js';
import type { OutputFormat } from '../../lib/types.js';

export default class SessionRevoke extends BaseCommand {
  static override description = 'Revoke on-chain permission and delete local session key.';

  static override flags = {
    ...BaseCommand.baseFlags,
  };

  async run(): Promise<void> {
    const { flags } = await this.parse(SessionRevoke);
    const format = flags.output as OutputFormat;

    if (!keystoreExists()) {
      this.log('No session to revoke.');
      return;
    }

    const sessionConfig = loadSessionConfig();
    const isExpired = sessionConfig.expiry <= Date.now() / 1000;

    if (isExpired) {
      // Expired — skip browser, just wipe local files
      deleteKeystore();
      deleteSessionConfig();
      if (format === 'json') {
        this.outputResult({ revoked: true, skippedOnChain: true }, format);
      } else {
        this.log('Session already expired. Cleaned up local files.');
      }
      return;
    }

    // Active session — revoke on-chain
    const config = loadConfig();
    const apiKey = this.resolveApiKey(flags);
    const pm = config.paymasters?.[sessionConfig.chainId];

    if (!flags.quiet) {
      this.log('Opening browser to revoke permission...');
    }

    const bridge = await getBridge({
      keysUrl: config.keysUrl,
      apiKey,
      chainId: sessionConfig.chainId,
      ens: config.ens,
      paymasterUrl: pm?.url,
    });

    await bridge.request('wallet_revokePermissions', [{ id: sessionConfig.permissionId }]);
    bridge.close();

    deleteKeystore();
    deleteSessionConfig();

    if (format === 'json') {
      this.outputResult({ revoked: true, skippedOnChain: false }, format);
    } else {
      this.log('Session revoked. On-chain permission removed and local keys deleted.');
    }
  }
}
