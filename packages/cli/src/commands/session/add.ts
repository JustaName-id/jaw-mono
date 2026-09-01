import { Flags } from '@oclif/core';
import * as fs from 'node:fs';
import { BaseCommand } from '../../base-command.js';
import { loadConfig } from '../../lib/config.js';
import { getBridge } from '../../lib/bridge-singleton.js';
import { keystoreExists } from '../../lib/keystore.js';
import {
  isLegacySession,
  liveOrphans,
  loadSessionConfig,
  parseGrantedPermission,
  saveSessionConfig,
} from '../../lib/session-config.js';
import type { OutputFormat, PermissionsConfig } from '../../lib/types.js';
import { parsePermissionsConfig } from '../../lib/validation.js';
import { extractGrantedSpend } from '../../x402/policy.js';
import { buildX402Permissions, DEFAULT_X402_LIMIT } from '../../x402/grant-preset.js';
import { whyGrantExceedsCeiling } from '../../x402/grant-ceiling.js';
import { mergePermissions, describeMerge } from '../../x402/merge-permissions.js';

/**
 * Add a capability to a session without taking away the ones it has.
 *
 * `session setup` replaces a session. An agent working under a scoped session
 * that then discovers it needs to pay could only re-run setup, which revokes
 * the grant it is working under, so it loses its other capabilities in the
 * middle of the task. The alternative was hand-writing the union as one
 * `--permissions` document, which means knowing the scope you already have.
 *
 * The session still holds one permission afterwards. The union is granted as a
 * new one and the old is revoked, rather than the session tracking several,
 * because two live grants are two independent budgets on chain: two of 5 a day
 * are 10 a day, and nothing in the system represents the total. One permission
 * keeps the number on screen the number that binds.
 *
 * The key is kept, which is the point: the agent's address, its balance and its
 * delegation all survive.
 */
export default class SessionAdd extends BaseCommand {
  static override description =
    'Add permissions to the current session, keeping the ones it already has (one browser approval to grant, one to revoke the old).';

  static override examples = [
    '<%= config.bin %> session add --x402',
    '<%= config.bin %> session add --x402 --limit 10/day',
    '<%= config.bin %> session add --permissions \'{"calls":[...]}\'',
  ];

  static override flags = {
    ...BaseCommand.baseFlags,
    permissions: Flags.string({
      description: 'Permissions to add (inline JSON or file path).',
      exclusive: ['x402'],
    }),
    x402: Flags.boolean({
      description: 'Add exactly what x402 payments need on the session chain. Tune the cap with --limit.',
      default: false,
      exclusive: ['permissions'],
    }),
    limit: Flags.string({
      description: `Spend cap for --x402, as <amount>/<period> (default ${DEFAULT_X402_LIMIT}).`,
    }),
  };

  async run(): Promise<void> {
    const { flags } = await this.parse(SessionAdd);
    const config = loadConfig();
    const format = flags.output as OutputFormat;
    const apiKey = this.resolveApiKey(flags);

    if (flags.limit && !flags.x402) {
      this.error('--limit only applies to --x402. Re-run with --x402, or set the cap inside --permissions.');
    }
    if (!flags.x402 && !flags.permissions) {
      this.error('Nothing to add. Pass --x402 for the payment preset, or --permissions with a scope.');
    }
    if (!keystoreExists()) {
      this.error('No session to add to. Run `jaw session setup` first.');
    }

    const session = loadSessionConfig();
    if (session.expiry <= Date.now() / 1000) {
      this.error('The session expired, so there is nothing to add to. Run `jaw session setup` to create a new one.');
    }
    if (isLegacySession(session)) {
      this.error(
        'This session was created by an older CLI and cannot be added to: its permission belongs to an address ' +
          'separate from the session key. Run `jaw session setup` to recreate it.'
      );
    }
    // The union needs the scope that is already granted, and only the stored
    // struct has it. A session written before that field keeps working; it just
    // cannot be merged against, because the old scope is not knowable from a
    // permission id.
    const existing = session.permission;
    if (!existing) {
      this.error(
        'This session does not carry the permission it was granted, so what it already allows cannot be read. ' +
          'Run `jaw session setup` to recreate it, and adding will work from then on.'
      );
    }

    const addition = this.resolveAddition(flags, session.chainId);
    const merged = mergePermissions(existing, addition);
    const changes = describeMerge(existing, merged);
    if (changes.length === 0) {
      this.log('The session already allows all of this. Nothing to do.');
      return;
    }

    const overCeiling = whyGrantExceedsCeiling(merged, session.chainId, config.grantCeiling);
    if (overCeiling) this.error(overCeiling);

    if (!flags.quiet && format !== 'json') {
      this.log('Adding to the current session:\n');
      for (const change of changes) this.log(change);
      this.log(
        '\nThe union is granted as a new permission and the old one is revoked, so the browser asks twice.\n' +
          'The session key is kept, so the address and its balance do not change.\n'
      );
      this.log('Opening browser to approve...');
    }

    const permissions = parsePermissionsConfig(merged);
    const bridge = await getBridge({ keysUrl: config.keysUrl, apiKey, chainId: session.chainId, ens: config.ens });
    let granted: unknown;
    try {
      granted = await bridge.request('wallet_grantPermissions', [
        {
          spender: session.sessionAddress,
          expiry: session.expiry,
          permissions,
          chainId: session.chainId,
          capabilities: { prefundSpender: true },
        },
      ]);
    } finally {
      bridge.close();
    }

    const response = granted as { permissionId: string; account: string };
    const permission = parseGrantedPermission(granted);

    // Granted before the old one is revoked, so the session is never without a
    // permission: a failure here leaves the agent holding what it had.
    let revoked = false;
    const revokeBridge = await getBridge({
      keysUrl: config.keysUrl,
      apiKey,
      chainId: session.chainId,
      ens: config.ens,
    });
    try {
      await revokeBridge.request('wallet_revokePermissions', [{ id: session.permissionId }]);
      revoked = true;
    } catch (err) {
      // Not fatal, and not silent. The new permission is live and the session
      // has to record it; the old one stays live until it is revoked, and it is
      // recorded so `session revoke` can still reach it.
      this.logToStderr(
        `Warning: the new permission was granted, but revoking the old one failed: ` +
          `${err instanceof Error ? err.message : String(err)}. It stays live until it expires, and ` +
          `\`jaw session revoke\` will revoke it.`
      );
    } finally {
      revokeBridge.close();
    }

    const orphans = liveOrphans(session.orphanedPermissions);
    saveSessionConfig({
      ownerAddress: response.account,
      sessionAddress: session.sessionAddress,
      permissionId: response.permissionId,
      chainId: session.chainId,
      expiry: session.expiry,
      mode: 'eip7702',
      grantedSpend: extractGrantedSpend(
        permissions.spends,
        session.chainId,
        permission ? new Date(permission.start * 1000) : undefined
      ),
      ...(permission ? { permission } : {}),
      ...(revoked
        ? orphans.length > 0
          ? { orphanedPermissions: orphans }
          : {}
        : {
            orphanedPermissions: [
              { id: session.permissionId, chainId: session.chainId, expiry: session.expiry },
              ...orphans,
            ],
          }),
    });

    const summary = {
      sessionAddress: session.sessionAddress,
      permissionId: response.permissionId,
      previousPermissionId: session.permissionId,
      previousRevoked: revoked,
      expiry: session.expiry,
    };
    if (format === 'json' || flags.quiet) {
      this.outputResult(summary, format);
      return;
    }
    this.log('\nSession updated.\n');
    this.log(`  Session address:  ${session.sessionAddress}`);
    this.log(`  Permission ID:    ${response.permissionId}`);
    this.log(`  Chain:            ${session.chainId}`);
    this.log(`  Expires:          ${new Date(session.expiry * 1000).toISOString()}`);
  }

  private resolveAddition(
    flags: { x402: boolean; limit?: string; permissions?: string },
    chainId: number
  ): PermissionsConfig {
    if (flags.x402) {
      try {
        return parsePermissionsConfig(buildX402Permissions(chainId, flags.limit));
      } catch (err) {
        this.error(err instanceof Error ? err.message : String(err));
      }
    }
    const value = flags.permissions as string;
    let raw: unknown;
    if (value.trimStart().startsWith('{')) {
      try {
        raw = JSON.parse(value);
      } catch {
        this.error(`--permissions is not valid JSON: ${value}`);
      }
    } else {
      const content = fs.readFileSync(value, 'utf-8');
      try {
        raw = JSON.parse(content);
      } catch {
        this.error(`Permissions file at ${value} is not valid JSON.`);
      }
    }
    return parsePermissionsConfig(raw);
  }
}
