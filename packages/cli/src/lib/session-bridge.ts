import { loadSessionKey } from './keystore.js';
import { isLegacySession, loadSessionConfig, type SessionConfig } from './session-config.js';
import { loadConfig } from './config.js';
import { usdcForNetwork, type UsdcAsset } from '../x402/asset-registry.js';
import { gasFloor } from '../x402/gas-reserve.js';

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
): Pick<SessionBridgeOptions, 'paymasterUrl' | 'paymasterContext'> & { gasToken?: UsdcAsset } {
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
  if (!asset) {
    // Say so rather than falling through quietly: the userOp goes out
    // unsponsored, and the failure the user eventually sees is about native
    // funds and mentions none of this. stderr, so stdio MCP framing is untouched.
    console.warn(
      `[jaw] No USDC in the x402 asset registry for chain ${options.chainId}, so no ERC-20 paymaster ` +
        'can be engaged. Gas will come out of the account\u2019s native balance. ' +
        'Set `paymasters` in your config to sponsor this chain.'
    );
    return {};
  }

  const url = new URL(JAW_ERC20_PAYMASTER_URL);
  url.searchParams.set('chainId', String(options.chainId));
  url.searchParams.set('api-key', options.apiKey);
  // `gasToken` marks this as our own fallback, the only case where the bridge
  // may drop the token and ask for sponsorship instead. A paymaster the caller
  // configured is theirs, mode included.
  return { paymasterUrl: url.toString(), paymasterContext: { token: asset.address }, gasToken: asset };
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
  private readonly gasToken: UsdcAsset | null;
  private session: InitializedSession | null = null;

  constructor(options: SessionBridgeOptions) {
    const { gasToken, ...paymaster } = resolvePaymaster(options);
    this.options = { ...options, ...paymaster };
    this.gasToken = gasToken ?? null;
  }

  private async getSession(): Promise<InitializedSession> {
    if (this.session) {
      this.checkExpiry(this.session.config);
      return this.session;
    }

    const config = loadSessionConfig();
    this.checkExpiry(config);

    // Sessions from before the CLI settled on EIP-7702 granted their permission
    // to a counterfactual second address, which holds nothing and so cannot be
    // charged the gas of the ops it sends. Re-deriving one of those here would
    // produce a different address and fail at the mismatch guard below, which
    // blames the keystore. Say what it actually is, and how to fix it.
    if (isLegacySession(config)) {
      throw new Error(
        'This session was created by an older CLI and uses a session address separate from the session key. ' +
          'Run `jaw session setup` to recreate it, which offers to revoke the old permission first. ' +
          '`jaw session status` still shows the old session, and `jaw session revoke` still revokes it.'
      );
    }

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
    // Every session is EIP-7702, so the account re-derives to the session key
    // EOA and the delegation rides its userOps. Deriving any other way would
    // produce an address the permission was never granted to.
    const account = await Account.fromLocalAccount(
      {
        chainId: this.options.chainId,
        apiKey: this.options.apiKey,
        paymasterUrl: this.options.paymasterUrl,
        paymasterContext: this.options.paymasterContext,
      },
      localAccount,
      { eip7702: true }
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

  /**
   * Whether the sending account holds less USDC than the ERC-20 paymaster would
   * need to charge it. Only asked on our own fallback paymaster.
   *
   * A read that fails answers no: the send then goes out exactly as it would
   * have without this check, rather than turning an RPC hiccup into a silent
   * change of who pays.
   */
  private async cannotCoverGas(sender: `0x${string}`): Promise<boolean> {
    if (!this.gasToken) return false;
    try {
      // Imported here, not at module scope, for the same reason as the rest of
      // this file: `balance.js` pulls viem, and the CLI keeps it off startup.
      const { usdcBalance } = await import('../x402/balance.js');
      const { raw } = await usdcBalance(this.gasToken.wireNetwork, sender);
      return BigInt(raw) < gasFloor(this.gasToken);
    } catch {
      return false;
    }
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
        const sendOptions = { permissionId: config.permissionId as `0x${string}` };

        // The ERC-20 paymaster charges the account the userOp is sent from,
        // and an account with no USDC cannot be charged. That is the first op
        // of a session: this account is the x402 payer, and the refill it is
        // about to send is what funds it. Sending without the token in context
        // asks the same paymaster to sponsor instead, which is how this path
        // behaved before the context reached the SDK. Refills leave
        // `gasReserve` behind so the ops after it are charged, though nothing
        // fences that reserve off from the payments themselves: a run of prices
        // well under it can spend it down to the floor and land here again.
        if (await this.cannotCoverGas(config.sessionAddress as `0x${string}`)) {
          return account.sendCalls(calls, sendOptions, this.options.paymasterUrl, undefined);
        }

        return account.sendCalls(calls, sendOptions);
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
