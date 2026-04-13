import { Flags } from '@oclif/core';
import * as fs from 'node:fs';
import { BaseCommand } from '../../base-command.js';
import { loadConfig } from '../../lib/config.js';
import { getBridge } from '../../lib/bridge-singleton.js';
import { generateSessionKey, saveKeystore, keystoreExists } from '../../lib/keystore.js';
import { saveSessionConfig } from '../../lib/session-config.js';
import type { OutputFormat, PermissionsConfig } from '../../lib/types.js';

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
    if (keystoreExists()) {
      if (!flags.yes) {
        const readline = await import('node:readline');
        const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
        const answer = await new Promise<string>((resolve) => {
          rl.question('Existing session found. Overwrite? (y/N) ', resolve);
        });
        rl.close();
        if (answer.toLowerCase() !== 'y') {
          this.log('Aborted.');
          return;
        }
      }
    }

    // 2. Resolve permissions
    const permissions = this.resolvePermissions(flags.permissions, config.permissions);

    // 3. Resolve expiry
    const expiryDays = flags.expiry ?? config.sessionExpiry ?? 7;
    const expiryTimestamp = Math.floor(Date.now() / 1000) + expiryDays * 86400;

    // 4. Generate session key
    const privateKeyHex = generateSessionKey();

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
    if (flagValue) {
      if (flagValue.trimStart().startsWith('{')) {
        return JSON.parse(flagValue) as PermissionsConfig;
      }
      // File path
      const content = fs.readFileSync(flagValue, 'utf-8');
      return JSON.parse(content) as PermissionsConfig;
    }

    if (configValue) {
      return configValue;
    }

    this.error('Permissions required. Set via --permissions flag or add "permissions" to ~/.jaw/config.json');
  }
}
