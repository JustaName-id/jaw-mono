import { privateKeyToAccount } from 'viem/accounts';
import { keystoreExists, loadSessionKey } from '../lib/keystore.js';
import { buildExactPayment, type BuildExactOptions, type ExactSigner } from './scheme-exact-evm.js';
import type { X402PaymentPayload, X402PaymentRequirement } from './types.js';

/**
 * Produces the x402 payment for a chosen requirement. The interface is
 * settlement-mode agnostic so the same tool surface serves both paths of the
 * payer decision (see the x402 research):
 *
 *  - pull (`Eip3009EoaPayer`, MVP): the session-key EOA signs an EIP-3009
 *    authorization; the facilitator broadcasts. `from` is the EOA, funds live
 *    in it, capped by the tool policy + its own balance.
 *  - push (later): the smart account executes via `wallet_sendCalls(permissionId)`
 *    and returns a receipt, bounded by the on-chain permission.
 */
export interface Payer {
  /** The paying address — `from` in the authorization. */
  readonly address: `0x${string}`;
  /** Build (and, in pull mode, sign) the payment for a requirement. */
  pay(requirement: X402PaymentRequirement, opts?: BuildExactOptions): Promise<X402PaymentPayload>;
}

/**
 * Pull-mode payer: the local session-key EOA signs the EIP-3009 authorization
 * directly (`eth_signTypedData_v4` semantics via viem). This is Option A — the
 * fast, standard path — and the funds must sit in this EOA.
 */
export class Eip3009EoaPayer implements Payer {
  readonly address: `0x${string}`;
  private readonly sign: ExactSigner;

  private constructor(address: `0x${string}`, sign: ExactSigner) {
    this.address = address;
    this.sign = sign;
  }

  /** Load the session key from the keystore and build a pull-mode payer. */
  static fromSessionKey(): Eip3009EoaPayer {
    if (!keystoreExists()) {
      throw new Error('No session key. Run `jaw session setup` to enable autonomous payments.');
    }
    const account = privateKeyToAccount(loadSessionKey() as `0x${string}`);
    // viem's strict TypedData generics don't line up with our concrete
    // ExactTypedData shape; the runtime call is identical.
    const sign: ExactSigner = (typedData) => account.signTypedData(typedData as never);
    return new Eip3009EoaPayer(account.address, sign);
  }

  pay(requirement: X402PaymentRequirement, opts?: BuildExactOptions): Promise<X402PaymentPayload> {
    return buildExactPayment(requirement, this.address, this.sign, opts);
  }
}

/**
 * The address pull-mode payments are made from — the session key's own EOA,
 * which is DISTINCT from the session smart-account address (`sessionAddress`).
 * This is the address that must hold USDC for `jaw_pay_and_fetch` to pay; expose
 * it so a user/agent knows where to send funds. Derives the public address only
 * (no signing, no key exposure). Throws if no session key exists.
 */
export function sessionPayerAddress(): `0x${string}` {
  if (!keystoreExists()) {
    throw new Error('No session key. Run `jaw session setup` first.');
  }
  return privateKeyToAccount(loadSessionKey() as `0x${string}`).address;
}
