import { BaseCommand } from '../../base-command.js';
import { keystoreExists } from '../../lib/keystore.js';
import { loadSessionConfig } from '../../lib/session-config.js';
import type { OutputFormat } from '../../lib/types.js';

export default class SessionStatus extends BaseCommand {
  static override description = 'Show current session status (address, permissions, expiry).';

  static override flags = {
    ...BaseCommand.baseFlags,
  };

  async run(): Promise<void> {
    const { flags } = await this.parse(SessionStatus);
    const format = flags.output as OutputFormat;

    if (!keystoreExists()) {
      this.log('No session configured. Run `jaw session setup`.');
      return;
    }

    const config = loadSessionConfig();
    const now = Date.now() / 1000;
    const isExpired = config.expiry <= now;

    if (format === 'json') {
      this.outputResult(
        {
          ...config,
          expired: isExpired,
        },
        format
      );
      return;
    }

    if (isExpired) {
      const ago = Math.floor((now - config.expiry) / 86400);
      this.log('Session expired.\n');
      this.log(`  Session address:  ${config.sessionAddress}`);
      this.log(`  Owner address:    ${config.ownerAddress}`);
      this.log(`  Permission ID:    ${config.permissionId}`);
      this.log(`  Chain:            ${config.chainId}`);
      this.log(`  Expired:          ${new Date(config.expiry * 1000).toISOString()} (${ago} days ago)`);
      this.log('\nRun `jaw session setup` to create a new session.');
    } else {
      const remaining = Math.floor((config.expiry - now) / 86400);
      this.log('Session active.\n');
      this.log(`  Session address:  ${config.sessionAddress}`);
      this.log(`  Owner address:    ${config.ownerAddress}`);
      this.log(`  Permission ID:    ${config.permissionId}`);
      this.log(`  Chain:            ${config.chainId}`);
      this.log(`  Expires:          ${new Date(config.expiry * 1000).toISOString()}`);
      this.log(`  Status:           Valid (${remaining} days remaining)`);
    }
  }
}
