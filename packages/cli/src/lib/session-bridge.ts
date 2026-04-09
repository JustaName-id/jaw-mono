import { Account } from '@jaw.id/core';
import { privateKeyToAccount } from 'viem/accounts';
import { loadSessionKey } from './keystore.js';
import { loadSessionConfig, type SessionConfig } from './session-config.js';
import { loadConfig } from './config.js';

export interface SessionBridgeOptions {
  apiKey: string;
  chainId: number;
  paymasterUrl?: string;
  paymasterContext?: Record<string, unknown>;
}

export class SessionBridge {
  private readonly options: SessionBridgeOptions;
  private account: Account | null = null;
  private sessionConfig: SessionConfig | null = null;
  private initialized = false;

  constructor(options: SessionBridgeOptions) {
    this.options = { ...options };

    // Resolve paymaster from config if not provided
    if (!this.options.paymasterUrl) {
      const config = loadConfig();
      const pm = config.paymasters?.[this.options.chainId];
      if (pm) {
        this.options.paymasterUrl = pm.url;
        this.options.paymasterContext = pm.context;
      }
    }
  }

  private async init(): Promise<void> {
    if (this.initialized) return;

    // 1. Decrypt keystore
    let privateKeyHex: string | null = loadSessionKey(this.options.apiKey);

    // 2. Create viem LocalAccount
    const localAccount = privateKeyToAccount(privateKeyHex as `0x${string}`);

    // 3. Memory hygiene — null the hex string
    privateKeyHex = null;

    // 4. Create JAW Account
    this.account = await Account.fromLocalAccount(
      {
        chainId: this.options.chainId,
        apiKey: this.options.apiKey,
        paymasterUrl: this.options.paymasterUrl,
        paymasterContext: this.options.paymasterContext,
      },
      localAccount
    );

    // 5. Load session config and check expiry
    this.sessionConfig = loadSessionConfig();
    this.initialized = true;
  }

  private checkExpiry(): void {
    if (!this.sessionConfig) return;
    if (this.sessionConfig.expiry <= Date.now() / 1000) {
      const expiryDate = new Date(this.sessionConfig.expiry * 1000).toISOString();
      throw new Error(`Session expired on ${expiryDate}. Run \`jaw session setup\` to create a new session.`);
    }
  }

  async request(method: string, params?: unknown): Promise<unknown> {
    await this.init();
    this.checkExpiry();

    const account = this.account!;
    const config = this.sessionConfig!;

    switch (method) {
      case 'eth_requestAccounts':
      case 'eth_accounts':
        return [config.sessionAddress];

      case 'wallet_sendCalls': {
        // params can be { calls } (from CLI JSON.parse) or [{ calls }] (EIP-5792 array format)
        const payload = Array.isArray(params) ? params[0] : params;
        const { calls } = payload as { calls: Array<{ to: string; value?: string; data?: string }> };
        return account.sendCalls(calls as Parameters<Account['sendCalls']>[0], {
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
        // params can be [address, typedDataStr] or just the typed data object
        let typedData: unknown;
        if (Array.isArray(params)) {
          const raw = params.length > 1 ? params[1] : params[0];
          typedData = typeof raw === 'string' ? JSON.parse(raw) : raw;
        } else {
          typedData = typeof params === 'string' ? JSON.parse(params) : params;
        }
        return account.signTypedData(typedData as Parameters<Account['signTypedData']>[0]);
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
