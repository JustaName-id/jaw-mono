import { BaseCommand } from '../../base-command.js';
import { loadConfig } from '../../lib/config.js';
import { getBridge } from '../../lib/bridge-singleton.js';
import { deleteKeystore, keystoreExists } from '../../lib/keystore.js';
import { loadSessionConfig, deleteSessionConfig, liveOrphans } from '../../lib/session-config.js';
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
    const now = Date.now() / 1000;

    // The session's own permission, plus any this key still holds that the
    // session no longer names. `session setup` replaces a session rather than
    // adding to it and does not always revoke what it replaces, so the key can
    // be carrying more authority than the config's single id describes.
    //
    // Expired ones are skipped for the same reason an expired session skips the
    // browser: they authorise nothing, and opening a window to say so is worse
    // than saying nothing.
    const targets = [
      ...(sessionConfig.expiry > now
        ? [{ id: sessionConfig.permissionId, chainId: sessionConfig.chainId, expiry: sessionConfig.expiry }]
        : []),
      ...liveOrphans(sessionConfig.orphanedPermissions, now),
    ];

    if (targets.length === 0) {
      deleteKeystore();
      deleteSessionConfig();
      if (format === 'json') {
        this.outputResult({ revoked: true, skippedOnChain: true, revokedIds: [] }, format);
      } else {
        this.log('Session already expired. Cleaned up local files.');
      }
      return;
    }

    const config = loadConfig();
    const apiKey = this.resolveApiKey(flags);
    if (!flags.quiet) {
      this.log(
        targets.length === 1
          ? 'Opening browser to revoke permission...'
          : `Opening browser to revoke ${targets.length} permissions...`
      );
    }

    // One bridge per chain, because an orphan can sit on a chain the current
    // session does not use: setup takes --chain, so replacing a session can
    // move it while leaving the old permission where it was.
    const revokedIds: string[] = [];
    try {
      for (const chainId of [...new Set(targets.map((t) => t.chainId))]) {
        const bridge = await getBridge({ keysUrl: config.keysUrl, apiKey, chainId, ens: config.ens });
        try {
          for (const target of targets.filter((t) => t.chainId === chainId)) {
            await bridge.request('wallet_revokePermissions', [{ id: target.id }]);
            revokedIds.push(target.id);
          }
        } finally {
          bridge.close();
        }
      }
    } finally {
      // The local files go only for what was actually revoked. Deleting them
      // after a partial failure would strand whatever is left exactly the way
      // an untracked orphan was stranded before it was recorded.
      if (revokedIds.length === targets.length) {
        deleteKeystore();
        deleteSessionConfig();
      }
    }

    if (format === 'json') {
      this.outputResult({ revoked: true, skippedOnChain: false, revokedIds }, format);
    } else {
      this.log('Session revoked. On-chain permission removed and local keys deleted.');
      if (revokedIds.length > 1) {
        this.log(`Revoked ${revokedIds.length} permissions this key was holding.`);
      }
    }
  }
}
