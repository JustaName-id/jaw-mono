import { loadSessionKey } from './keystore.js';
import { loadSessionConfig, type SessionConfig } from './session-config.js';
import { loadConfig } from './config.js';

export interface SessionBridgeOptions {
  apiKey: string;
  chainId: number;
  paymasterUrl?: string;
  paymasterContext?: Record<string, unknown>;
}

/** Lazily resolved Account instance + session config */
interface InitializedSession {
  account: {
    address: string;
    sendCalls: (...args: unknown[]) => Promise<unknown>;
    getCallStatus: (batchId: `0x${string}`) => Promise<unknown>;
    signMessage: (message: string) => Promise<`0x${string}`>;
    signTypedData: (typedData: unknown) => Promise<`0x${string}`>;
  };
  config: SessionConfig;
}

export class SessionBridge {
  private readonly options: SessionBridgeOptions;
  private session: InitializedSession | null = null;

  constructor(options: SessionBridgeOptions) {
    this.options = { ...options };

    if (!this.options.paymasterUrl) {
      const config = loadConfig();
      const pm = config.paymasters?.[this.options.chainId];
      if (pm) {
        this.options.paymasterUrl = pm.url;
        this.options.paymasterContext = pm.context;
      }
    }
  }

  private async getSession(): Promise<InitializedSession> {
    if (this.session) {
      this.checkExpiry(this.session.config);
      return this.session;
    }

    const config = loadSessionConfig();
    this.checkExpiry(config);

    if (config.chainId !== this.options.chainId) {
      throw new Error(
        `Session was created for chain ${config.chainId}, but --chain ${this.options.chainId} was requested. ` +
          `Run \`jaw session setup --chain ${this.options.chainId}\` to create a session for that chain.`
      );
    }

    let privateKeyHex: string | null = loadSessionKey();

    const { privateKeyToAccount } = await import('viem/accounts');
    const localAccount = privateKeyToAccount(privateKeyHex as `0x${string}`);
    privateKeyHex = null;

    const { Account } = await import('@jaw.id/core');
    // Sessions created with `--eip7702` must re-derive the same way: without
    // the option the account would be the counterfactual sibling — a different
    // address than the permission's spender — and no delegation would ever be
    // attached to its userOps.
    const account = await Account.fromLocalAccount(
      {
        chainId: this.options.chainId,
        apiKey: this.options.apiKey,
        paymasterUrl: this.options.paymasterUrl,
        paymasterContext: this.options.paymasterContext,
      },
      localAccount,
      { eip7702: config.mode === 'eip7702' }
    );

    // The stored sessionAddress is the on-chain permission's spender. If the
    // key or mode drifted since setup (hand-edited keystore, config from
    // another machine), signing would come from an account the permission was
    // never granted to — fail clearly instead of sending doomed userOps.
    if (account.address.toLowerCase() !== config.sessionAddress.toLowerCase()) {
      throw new Error(
        `Session key derives ${account.address}, but the stored session address is ${config.sessionAddress}. ` +
          'The keystore and session config are out of sync. Run `jaw session setup` to recreate the session.'
      );
    }

    this.session = { account: account as InitializedSession['account'], config };
    return this.session;
  }

  private checkExpiry(config: SessionConfig): void {
    if (config.expiry <= Date.now() / 1000) {
      const expiryDate = new Date(config.expiry * 1000).toISOString();
      throw new Error(`Session expired on ${expiryDate}. Run \`jaw session setup\` to create a new session.`);
    }
  }

  async request(method: string, params?: unknown): Promise<unknown> {
    const { account, config } = await this.getSession();

    switch (method) {
      case 'eth_requestAccounts':
      case 'eth_accounts':
        return [config.sessionAddress];

      case 'wallet_sendCalls': {
        const payload = Array.isArray(params) ? params[0] : params;
        const { calls } = payload as {
          calls: Array<{ to: string; value?: string; data?: string }>;
        };
        return account.sendCalls(calls, {
          permissionId: config.permissionId as `0x${string}`,
        });
      }

      case 'wallet_getCallsStatus': {
        const batchId = Array.isArray(params) ? params[0] : params;
        return account.getCallStatus(batchId as `0x${string}`);
      }

      case 'personal_sign': {
        const message = Array.isArray(params) ? params[0] : params;
        return account.signMessage(message as string);
      }

      case 'eth_signTypedData_v4': {
        const asArray = Array.isArray(params) ? params : [params];
        const raw = asArray.length > 1 ? asArray[1] : asArray[0];
        const typedData = typeof raw === 'string' ? JSON.parse(raw) : raw;
        return account.signTypedData(typedData);
      }

      case 'wallet_grantPermissions':
        throw new Error('Requires browser — run `jaw session setup`.');

      case 'wallet_revokePermissions':
        throw new Error('Requires browser — run `jaw session revoke`.');

      default:
        throw new Error(`Method ${method} is not supported in auto mode.`);
    }
  }

  close(): void {
    // No-op — no WebSocket to close
  }
}
