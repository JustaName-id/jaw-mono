import { Flags } from '@oclif/core';
import * as fs from 'node:fs';
import { BaseCommand } from '../../base-command.js';
import { loadConfig } from '../../lib/config.js';
import { getBridge } from '../../lib/bridge-singleton.js';
import {
  generateSessionKey,
  saveKeystore,
  keystoreExists,
  deleteKeystore,
  loadSessionKey,
} from '../../lib/keystore.js';
import { saveSessionConfig, loadSessionConfig, deleteSessionConfig } from '../../lib/session-config.js';
import type { OutputFormat, PermissionsConfig } from '../../lib/types.js';
import { parsePermissionsConfig } from '../../lib/validation.js';

export default class SessionSetup extends BaseCommand {
  static override description =
    'Generate a session key and grant scoped on-chain permissions (one-time browser approval).';

  static override examples = [
    '<%= config.bin %> session setup --chain 84532',
    '<%= config.bin %> session setup --permissions \'{"calls":[...]}\' --expiry 14',
    '<%= config.bin %> session setup --permissions ./permissions.json',
  ];

  static override flags = {
    ...BaseCommand.baseFlags,
    permissions: Flags.string({
      description: 'Permission scope (inline JSON or file path). Overrides config.permissions.',
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

    // 1. Check existing session
    let reuseKey: string | null = null;

    if (keystoreExists()) {
      const existing = loadSessionConfig();
      const isActive = existing.expiry > Date.now() / 1000;

      if (!flags.yes) {
        const readline = await import('node:readline');
        const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
        const ask = (q: string) => new Promise<string>((resolve) => rl.question(q, resolve));

        if (isActive) {
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
            const pm = config.paymasters?.[existing.chainId];
            const revokeBridge = await getBridge({
              keysUrl: config.keysUrl,
              apiKey,
              chainId: existing.chainId,
              ens: config.ens,
              paymasterUrl: pm?.url,
            });
            await revokeBridge.request('wallet_revokePermissions', [{ id: existing.permissionId }]);
            revokeBridge.close();
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
      } else if (isActive) {
        // --yes mode: log warning but continue
        this.logToStderr(
          `Warning: overwriting active session without revoking. ` +
            `Old permission ${existing.permissionId} on chain ${existing.chainId} ` +
            `remains live until ${new Date(existing.expiry * 1000).toISOString()}.`
        );
      }

      deleteKeystore();
      deleteSessionConfig();
    }

    // 2. Resolve permissions
    const permissions = this.resolvePermissions(flags.permissions, config.permissions);

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
    const account = await Account.fromLocalAccount(
      {
        chainId,
        apiKey,
        paymasterUrl: pm?.url,
        paymasterContext: pm?.context,
      },
      localAccount
    );
    const sessionAddress = account.address;

    // 6. Open browser bridge to grant permissions
    if (!flags.quiet) {
      this.log('Opening browser to approve permissions...');
    }

    const bridge = await getBridge({
      keysUrl: config.keysUrl,
      apiKey,
      chainId,
      ens: config.ens,
      paymasterUrl: pm?.url,
    });

    const grantResponse = (await bridge.request('wallet_grantPermissions', [
      {
        spender: sessionAddress,
        expiry: expiryTimestamp,
        permissions,
        chainId,
      },
    ])) as { permissionId: string; account: string };

    bridge.close();

    // 7. Save keystore
    saveKeystore(privateKeyHex, sessionAddress);

    // 8. Save session config
    saveSessionConfig({
      ownerAddress: grantResponse.account,
      sessionAddress,
      permissionId: grantResponse.permissionId,
      chainId,
      expiry: expiryTimestamp,
    });

    // 9. Output
    const summary = {
      ownerAddress: grantResponse.account,
      sessionAddress,
      permissionId: grantResponse.permissionId,
      expiry: expiryTimestamp,
    };

    if (flags.quiet) {
      this.outputResult(summary, format);
    } else {
      this.log('\nSession created successfully.\n');
      this.log(`  Session address:  ${sessionAddress}`);
      this.log(`  Owner address:    ${grantResponse.account}`);
      this.log(`  Permission ID:    ${grantResponse.permissionId}`);
      this.log(`  Chain:            ${chainId}`);
      this.log(`  Expires:          ${new Date(expiryTimestamp * 1000).toISOString()} (${expiryDays} days)`);
      this.log('\nUse --session flag to execute RPC calls in auto mode.');
    }
  }

  private resolvePermissions(
    flagValue: string | undefined,
    configValue: PermissionsConfig | undefined
  ): PermissionsConfig {
    let raw: unknown;

    if (flagValue) {
      if (flagValue.trimStart().startsWith('{')) {
        raw = JSON.parse(flagValue);
      } else {
        const content = fs.readFileSync(flagValue, 'utf-8');
        raw = JSON.parse(content);
      }
    } else if (configValue) {
      raw = configValue;
    } else {
      this.error('Permissions required. Set via --permissions flag or add "permissions" to ~/.jaw/config.json');
    }

    return parsePermissionsConfig(raw);
  }
}
