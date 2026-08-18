import { loadSessionKey } from './keystore.js';
import { loadSessionConfig, type SessionConfig } from './session-config.js';
import { loadConfig } from './config.js';
import { usdcForNetwork } from '../x402/asset-registry.js';

// JAW's ERC-20 paymaster, mirrored from core's JAW_PAYMASTER_URL. Kept as a
// local literal rather than an import because `@jaw.id/core` is lazy-loaded in
// the CLI (a static import would pull it into startup); keep in sync if core's
// URL moves. The core SDK recognises this exact base URL and adds the USDC
// approval the paymaster needs, so the path must match byte for byte.
const JAW_ERC20_PAYMASTER_URL = 'https://api.justaname.id/proxy/v1/rpc/erc20-paymaster';

/**
 * The paymaster to sponsor an auto-mode userOp, in precedence order: an explicit
 * url, then `config.paymasters` for the chain, then JAW's own.
 *
 * Falling through to JAW's is what makes the default path need no configuration.
 * Without it a fresh setup could not top up at all: the account has to prefund
 * the EntryPoint for the worst-case gas, which fails on an account holding only
 * USDC, and the error names none of this. Asking the user for a paymaster url
 * put the ERC-7677 app-developer role on someone who is just using the wallet,
 * and it asked them to sign up with the provider we already proxy and pay for.
 *
 * The ERC-20 paymaster takes its fee in USDC, so the account never needs a
 * native token, which is the point: gas comes out of the same balance the
 * payments do. `config.paymasters` still wins, so anyone bringing their own
 * keeps it.
 */
function resolvePaymaster(
  options: SessionBridgeOptions
): Pick<SessionBridgeOptions, 'paymasterUrl' | 'paymasterContext'> {
  if (options.paymasterUrl) {
    return { paymasterUrl: options.paymasterUrl, paymasterContext: options.paymasterContext };
  }

  const configured = loadConfig().paymasters?.[options.chainId];
  if (configured) {
    return { paymasterUrl: configured.url, paymasterContext: configured.context };
  }

  // No api key means nothing to authenticate the proxy with, so there is no
  // sponsorship to offer; leaving it unset keeps the old unsponsored behaviour.
  if (!options.apiKey) return {};

  // The ERC-20 paymaster has to be told which token it is being paid in: the SDK
  // sizes and emits the `approve` it needs from this address, and without it the
  // userOp reaches the paymaster with no allowance behind it and cannot settle.
  // A chain the registry does not cover has no token to name, so fall back to
  // the unsponsored path rather than engaging a paymaster that must fail.
  const asset = usdcForNetwork(`eip155:${options.chainId}`);
  if (!asset) return {};

  const url = new URL(JAW_ERC20_PAYMASTER_URL);
  url.searchParams.set('chainId', String(options.chainId));
  url.searchParams.set('api-key', options.apiKey);
  return { paymasterUrl: url.toString(), paymasterContext: { token: asset.address } };
}

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
    this.options = { ...options, ...resolvePaymaster(options) };
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
