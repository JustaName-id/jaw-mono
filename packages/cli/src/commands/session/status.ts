import { BaseCommand } from '../../base-command.js';
import { keystoreExists } from '../../lib/keystore.js';
import { isLegacySession, loadSessionConfig } from '../../lib/session-config.js';
import { readLiveness, type PermissionLiveness } from '../../x402/permission-onchain.js';
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
    // The one fact no local file can hold. Expiry is already on disk, so it
    // needs no read; a revoke made from keys.jaw.id or from another machine
    // leaves this file saying the session is fine. Fails soft to 'unknown',
    // which is what a session written before the struct was stored reports.
    const liveness = await readLiveness(config);

    if (format === 'json') {
      this.outputResult(
        {
          ...config,
          expired: isExpired,
          permissionOnChain: liveness,
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
      this.log(`  Permission ID:    ${config.permissionId}${onChainNote(liveness)}`);
      this.log(`  Chain:            ${config.chainId}`);
      this.log(`  Expired:          ${new Date(config.expiry * 1000).toISOString()} (${ago} days ago)`);
      this.log('\nRun `jaw session setup` to create a new session.');
    } else {
      const remaining = Math.floor((config.expiry - now) / 86400);
      this.log('Session active.\n');
      this.log(`  Session address:  ${config.sessionAddress}`);
      if (isLegacySession(config)) {
        // Auto mode refuses these, so say it here rather than letting the next
        // command be the one that explains it.
        this.log('                    (separate from the session key: created by an older CLI)');
      } else {
        this.log('                    (the session key EOA, and the x402 payer)');
      }
      this.log(`  Owner address:    ${config.ownerAddress}`);
      this.log(`  Permission ID:    ${config.permissionId}${onChainNote(liveness)}`);
      this.log(`  Chain:            ${config.chainId}`);
      this.log(`  Expires:          ${new Date(config.expiry * 1000).toISOString()}`);
      // Revoked outranks the local expiry: the session has time left on paper
      // and can no longer pull anything through the permission.
      this.log(
        liveness === 'revoked'
          ? '  Status:           Revoked on chain. Run `jaw session setup` to create a new session.'
          : `  Status:           Valid (${remaining} days remaining)`
      );
    }
  }
}

/**
 * What to add after the permission id, or nothing when the chain did not
 * answer. Silence rather than "unknown" on every run of an older session: it
 * is a question the user did not ask and the CLI cannot answer.
 */
function onChainNote(liveness: PermissionLiveness): string {
  if (liveness === 'revoked') return '   (REVOKED on chain)';
  if (liveness === 'unapproved') return '   (not approved on chain)';
  if (liveness === 'mismatch') return '   (does not match the stored permission)';
  return '';
}
