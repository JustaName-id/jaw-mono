import { Flags } from '@oclif/core';
import * as fs from 'node:fs';
import { BaseCommand } from '../../base-command.js';
import { loadConfig } from '../../lib/config.js';
import { getBridge } from '../../lib/bridge-singleton.js';
import {
  generateSessionKey,
  saveKeystore,
  keystoreExists,
  loadSessionKey,
  tryLoadKeystoreAddress,
} from '../../lib/keystore.js';
import { saveSessionConfig, tryLoadSessionConfig } from '../../lib/session-config.js';
import type { OutputFormat, PermissionsConfig } from '../../lib/types.js';
import { parsePermissionsConfig } from '../../lib/validation.js';
import { extractGrantedSpend } from '../../x402/policy.js';
import { buildX402Permissions, describeX402Grant, DEFAULT_X402_LIMIT } from '../../x402/grant-preset.js';
import { whyOwnerCannotFundSession, whySpenderCannotPay } from '../../x402/funded-owner.js';

export default class SessionSetup extends BaseCommand {
  static override description =
    'Generate a session key and grant scoped on-chain permissions (one-time browser approval).';

  static override examples = [
    '<%= config.bin %> session setup --chain 8453 --x402',
    '<%= config.bin %> session setup --chain 8453 --x402 --limit 25/day --expiry 14',
    '<%= config.bin %> session setup --chain 84532',
    '<%= config.bin %> session setup --permissions \'{"calls":[...]}\' --expiry 14',
    '<%= config.bin %> session setup --permissions ./permissions.json',
  ];

  static override flags = {
    ...BaseCommand.baseFlags,
    permissions: Flags.string({
      description: 'Permission scope (inline JSON or file path). Overrides config.permissions.',
      exclusive: ['x402'],
    }),
    x402: Flags.boolean({
      description:
        'Grant exactly what x402 payments need on this chain: a USDC transfer capped per period. ' +
        'Builds the permission from the asset registry so the USDC address and function signature ' +
        'do not have to be written by hand. Tune the cap with --limit.',
      default: false,
      exclusive: ['permissions'],
    }),
    limit: Flags.string({
      description: `Spend cap for --x402, as <amount>/<period> (default ${DEFAULT_X402_LIMIT}). Examples: 25/day, 2.5/week, 100/month.`,
      // No `dependsOn: ['x402']`: a boolean flag with a default always reads as
      // provided, so oclif would never fire it. Checked in run() instead.
    }),
    expiry: Flags.integer({
      description: 'Permission expiry in days. Overrides config.sessionExpiry.',
    }),
  };

  async run(): Promise<void> {
    const { flags } = await this.parse(SessionSetup);
    const config = loadConfig();
    const format = flags.output as OutputFormat;
    const apiKey = this.resolveApiKey(flags);
    const chainId = this.resolveChainId(flags);

    if (flags.limit && !flags.x402) {
      this.error('--limit only applies to --x402. Re-run with --x402, or set the cap inside --permissions.');
    }

    // 1. Check existing session
    let reuseKey: string | null = null;
    let oldPermissionRevoked = false;

    if (keystoreExists()) {
      // A keystore can outlive its session-config: setup interrupted between the
      // grant and the config write, a manual delete, a half-restored backup.
      // Throwing here made `session setup` fail with "No session configured. Run
      // `jaw session setup` first", so the only way out was deleting the keystore
      // by hand, which strands the key while its on-chain permission stays live.
      const existing = tryLoadSessionConfig();
      const isActive = existing !== null && existing.expiry > Date.now() / 1000;

      // The prompt path uses readline against process.stdin. With non-TTY stdin
      // (pipes, heredocs, CI), readline races against the awaited bridge call
      // below: stdin EOFs while the browser approval is pending, readline auto-
      // closes, and the second `ask` throws ERR_USE_AFTER_CLOSE *after* on-chain
      // state has already mutated. Require --yes for non-interactive use.
      if (!flags.yes && !process.stdin.isTTY) {
        this.error(
          'Existing session key found, but stdin is not a terminal ' +
            '(piped, redirected, or running in CI). ' +
            'Re-run with --yes to overwrite the existing session non-interactively.'
        );
      }

      if (!flags.yes) {
        const readline = await import('node:readline');
        const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
        const ask = (q: string) => new Promise<string>((resolve) => rl.question(q, resolve));

        if (!existing) {
          const orphanAddress = tryLoadKeystoreAddress();
          this.log('Session key found, but no session config alongside it.\n');
          if (orphanAddress) {
            this.log(`  Key address:      ${orphanAddress}`);
          }
          this.log(
            '\nIf that key still holds a live on-chain permission it cannot be revoked\n' +
              'automatically, because the permission id lived in the missing config.\n' +
              'Reusing the key keeps a single key in play instead of leaving two.\n'
          );

          const reuseAnswer = await ask('Reuse existing session key? (Y/n) ');
          if (reuseAnswer.toLowerCase() !== 'n') {
            reuseKey = loadSessionKey();
          }
        } else if (isActive) {
          const remaining = Math.floor((existing.expiry - Date.now() / 1000) / 86400);
          this.log('Active session found:\n');
          this.log(`  Session address:  ${existing.sessionAddress}`);
          this.log(`  Permission ID:    ${existing.permissionId}`);
          this.log(`  Chain:            ${existing.chainId}`);
          this.log(
            `  Expires:          ${new Date(existing.expiry * 1000).toISOString()} (${remaining} days remaining)`
          );
          this.log('\nThe old on-chain permission will NOT be revoked automatically.');
          this.log('Anyone with the old session key can still use it until expiry.\n');

          const revokeAnswer = await ask('Revoke old permission on-chain first? (Y/n) ');
          if (revokeAnswer.toLowerCase() !== 'n') {
            this.log('Opening browser to revoke old permission...');
            const revokeBridge = await getBridge({
              keysUrl: config.keysUrl,
              apiKey,
              chainId: existing.chainId,
              ens: config.ens,
            });
            try {
              await revokeBridge.request('wallet_revokePermissions', [{ id: existing.permissionId }]);
            } finally {
              revokeBridge.close();
            }
            oldPermissionRevoked = true;
            this.log('Old permission revoked.');
          }

          const reuseAnswer = await ask('Reuse existing session key? (Y/n) ');
          if (reuseAnswer.toLowerCase() !== 'n') {
            reuseKey = loadSessionKey();
          }
        } else {
          const overwrite = await ask('Expired session found. Overwrite? (y/N) ');
          if (overwrite.toLowerCase() !== 'y') {
            rl.close();
            this.log('Aborted.');
            return;
          }
        }

        rl.close();
      } else if (!existing) {
        // --yes mode, orphaned key: a new one is generated below, so say which
        // key is being left behind rather than dropping it silently.
        const orphanAddress = tryLoadKeystoreAddress();
        this.logToStderr(
          `Warning: session key${orphanAddress ? ` ${orphanAddress}` : ''} has no session config. ` +
            `Generating a new key; any permission the old one still holds cannot be ` +
            `revoked automatically because the permission id is unknown.`
        );
      } else if (isActive) {
        // --yes mode: log warning but continue
        this.logToStderr(
          `Warning: overwriting active session without revoking. ` +
            `Old permission ${existing.permissionId} on chain ${existing.chainId} ` +
            `remains live until ${new Date(existing.expiry * 1000).toISOString()}.`
        );
      }

      // Old keystore/session-config are intentionally NOT deleted here.
      // saveKeystore/saveSessionConfig below overwrite them on success;
      // leaving them in place means a failed grant doesn't strand the user
      // with an active on-chain permission and no local key.
    }

    // Anything below can throw. If the inner revoke above already mutated
    // on-chain state, surface a recovery hint before re-throwing so the user
    // knows their local session-config now references a revoked permission.
    try {
      // 2. Resolve permissions
      const permissions = this.resolvePermissions(flags.permissions, config.permissions, {
        x402: flags.x402,
        limit: flags.limit,
        chainId,
      });

      // 3. Resolve expiry
      const expiryDays = flags.expiry ?? config.sessionExpiry ?? 7;
      const expiryTimestamp = Math.floor(Date.now() / 1000) + expiryDays * 86400;

      // 4. Generate or reuse session key
      const privateKeyHex = (reuseKey ?? generateSessionKey()) as `0x${string}`;

      // 5. Create LocalAccount and derive smart account address
      const { privateKeyToAccount } = await import('viem/accounts');
      const localAccount = privateKeyToAccount(privateKeyHex);

      const { Account } = await import('@jaw.id/core');
      const pm = config.paymasters?.[chainId];
      // EIP-7702 keeps the session address equal to the session key EOA, with
      // the delegation riding the first userOp. That is what lets the account
      // holding the USDC be the same one the ERC-20 paymaster charges for the
      // ops it sends; the factory's counterfactual address was a second one
      // that never held anything.
      const mode = 'eip7702' as const;
      const account = await Account.fromLocalAccount(
        {
          chainId,
          apiKey,
          paymasterUrl: pm?.url,
          paymasterContext: pm?.context,
        },
        localAccount,
        { eip7702: true }
      );
      const sessionAddress = account.address;

      // 6. Open browser bridge to grant permissions
      if (!flags.quiet) {
        if (flags.x402) {
          // Which account gets connected in the browser decides everything
          // below, and it is the last moment the user can pick a different one.
          this.log(
            `Connect with an account that holds USDC on chain ${chainId}.\n` +
              'Payments pull from it through the permission, and the grant carries 0.1 USDC\n' +
              'to the session so it can pay for its own first transaction.\n'
          );
        }
        this.log('Opening browser to approve permissions...');
      }

      const bridge = await getBridge({
        keysUrl: config.keysUrl,
        apiKey,
        chainId,
        ens: config.ens,
      });

      let grantResponse: { permissionId: string; account: string };
      try {
        if (flags.x402) {
          const blocked = await whyOwnerCannotFundSession({ chainId, request: (m, p) => bridge.request(m, p) });
          if (blocked) this.error(blocked);
        }

        grantResponse = (await bridge.request('wallet_grantPermissions', [
          {
            spender: sessionAddress,
            expiry: expiryTimestamp,
            permissions,
            chainId,
            // The session account sends every op the permission authorises, and
            // the ERC-20 paymaster charges the sender, so its first one has
            // nothing to be charged. The wallet rides a small transfer along in
            // this same transaction; it decides the amount.
            capabilities: { prefundSpender: true },
          },
        ])) as { permissionId: string; account: string };
      } finally {
        bridge.close();
      }

      // 7. Save keystore
      saveKeystore(privateKeyHex, sessionAddress);

      // 8. Save session config
      saveSessionConfig({
        ownerAddress: grantResponse.account,
        sessionAddress,
        permissionId: grantResponse.permissionId,
        chainId,
        expiry: expiryTimestamp,
        mode,
        grantedSpend: extractGrantedSpend(permissions.spends, chainId),
      });

      // 8.5 The grant asked the wallet to seed the spender. Check that it did.
      //
      //      An unsupported capability is ignored rather than refused, so a
      //      wallet that does not implement `prefundSpender` leaves the session
      //      unable to pay for anything, and says nothing about it. The failure
      //      then surfaces at the first operation, in an error about sizing a
      //      paymaster approval, long after the user has left this screen.
      const unfunded = await whySpenderCannotPay({ chainId, spender: sessionAddress });
      if (unfunded) this.logToStderr(`\nWarning: ${unfunded}`);

      // 9. Output
      const summary = {
        ownerAddress: grantResponse.account,
        sessionAddress,
        permissionId: grantResponse.permissionId,
        expiry: expiryTimestamp,
        mode,
      };

      if (flags.quiet) {
        this.outputResult(summary, format);
      } else {
        this.log('\nSession created successfully.\n');
        this.log(`  Session address:  ${sessionAddress}`);
        this.log('                    (the session key EOA, and the x402 payer)');
        this.log(`  Owner address:    ${grantResponse.account}`);
        if (flags.x402) {
          // Where the money stays. Sending it to the session address instead is
          // the easiest thing to get wrong, and getting it wrong looks like it
          // worked: payments succeed from there without ever exercising the
          // permission, so the cap the user granted applies to nothing.
          this.log(`                    (payments pull from here, capped at ${describeX402Grant(flags.limit)})`);
        }
        this.log(`  Permission ID:    ${grantResponse.permissionId}`);
        this.log(`  Chain:            ${chainId}`);
        this.log(`  Expires:          ${new Date(expiryTimestamp * 1000).toISOString()} (${expiryDays} days)`);
        this.log('\nUse --session flag to execute RPC calls in auto mode.');
      }
    } catch (error) {
      if (oldPermissionRevoked) {
        this.logToStderr(
          'Old permission was revoked on-chain but setup did not complete. ' +
            'Local session-config still references the revoked permission; ' +
            'run `jaw session setup` again to create a new session.'
        );
      }
      throw error;
    }
  }

  private resolvePermissions(
    flagValue: string | undefined,
    configValue: PermissionsConfig | undefined,
    preset: { x402: boolean; limit?: string; chainId: number }
  ): PermissionsConfig {
    let raw: unknown;

    // --x402 derives the scope instead of asking for it. Checked first: it is
    // mutually exclusive with --permissions at the flag level, and it should
    // win over a config block the user is deliberately bypassing.
    if (preset.x402) {
      try {
        raw = buildX402Permissions(preset.chainId, preset.limit);
      } catch (err) {
        this.error(err instanceof Error ? err.message : String(err));
      }
    } else if (flagValue) {
      if (flagValue.trimStart().startsWith('{')) {
        try {
          raw = JSON.parse(flagValue);
        } catch {
          this.error(`--permissions is not valid JSON: ${flagValue}`);
        }
      } else {
        const content = fs.readFileSync(flagValue, 'utf-8');
        try {
          raw = JSON.parse(content);
        } catch {
          this.error(`Permissions file at ${flagValue} is not valid JSON.`);
        }
      }
    } else if (configValue) {
      raw = configValue;
    } else {
      this.error(
        'Permissions required. For x402 payments run `jaw session setup --x402` and the scope is ' +
          'built for you. Otherwise pass --permissions or add "permissions" to ~/.jaw/config.json.'
      );
    }

    return parsePermissionsConfig(raw);
  }
}
