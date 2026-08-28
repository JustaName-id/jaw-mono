import { privateKeyToAccount } from 'viem/accounts';
import { parseAbi } from 'viem';
import { keystoreExists, loadSessionKey } from '../lib/keystore.js';
import { hashTypedData as erc7739HashTypedData, wrapTypedDataSignature } from 'viem/experimental/erc7739';
import {
  buildExactPayment,
  type BuildExactOptions,
  type ExactSigner,
  type ExactTypedData,
} from './scheme-exact-evm.js';
import { publicClientFor } from './balance.js';
import { usdcForNetwork } from './asset-registry.js';
import type { X402PaymentPayload, X402PaymentRequirement } from './types.js';

/**
 * Produces the x402 payment for a chosen requirement. The interface is
 * settlement-mode agnostic so the same tool surface can serve both settlement
 * styles:
 *
 *  - pull (`Eip3009EoaPayer`): the session-key EOA signs an EIP-3009
 *    authorization; the facilitator broadcasts. `from` is the EOA, funds live
 *    in it, capped by the tool policy + its own balance.
 *  - push: the smart account executes via `wallet_sendCalls(permissionId)` and
 *    returns a receipt, bounded by the on-chain permission.
 */
export interface Payer {
  /** The paying address — `from` in the authorization. */
  readonly address: `0x${string}`;
  /** Build (and, in pull mode, sign) the payment for a requirement. */
  pay(requirement: X402PaymentRequirement, opts?: BuildExactOptions): Promise<X402PaymentPayload>;
}

/** EIP-7702 delegation designator prefix (the EOA "has code" once delegated). */
const EIP7702_CODE_PREFIX = '0xef0100';

/** The EIP-712 domain of the delegated account, read from it on chain. */
interface AccountEip712Domain {
  name: string;
  version: string;
  chainId: bigint;
  verifyingContract: `0x${string}`;
  salt: `0x${string}`;
}

const EIP712_DOMAIN_ABI = parseAbi([
  'function eip712Domain() view returns (bytes1 fields, string name, string version, uint256 chainId, address verifyingContract, bytes32 salt, uint256[] extensions)',
]);

/**
 * Pull-mode payer: the local session-key EOA signs the EIP-3009 authorization.
 * The funds must sit in this EOA.
 *
 * Delegation-aware: while the EOA has no code the signature is the plain
 * typed-data one (ecrecover path). Once the session was upgraded in place via
 * EIP-7702 (which the first userOp of a session does), USDC validates through
 * EIP-1271/ERC-7739 instead, so the payer detects the delegation designator and
 * signs the wrapped TypedDataSign envelope (see `wrappedSigner`).
 */
export class Eip3009EoaPayer implements Payer {
  readonly address: `0x${string}`;
  private readonly signTypedData: ExactSigner;
  private readonly signHash: (hash: `0x${string}`) => Promise<`0x${string}`>;
  /**
   * eip712Domain() of the delegate, cached per chain after the first wrapped
   * payment there. Keyed by chainId: the domain embeds block.chainid, so a
   * domain read on one chain must never sign an envelope for another.
   */
  private readonly accountDomainByChain = new Map<number, AccountEip712Domain>();

  private constructor(
    address: `0x${string}`,
    signTypedData: ExactSigner,
    signHash: (hash: `0x${string}`) => Promise<`0x${string}`>
  ) {
    this.address = address;
    this.signTypedData = signTypedData;
    this.signHash = signHash;
  }

  /** Load the session key from the keystore and build a pull-mode payer. */
  static fromSessionKey(): Eip3009EoaPayer {
    if (!keystoreExists()) {
      throw new Error('No session key. Run `jaw session setup` to enable autonomous payments.');
    }
    const account = privateKeyToAccount(loadSessionKey() as `0x${string}`);
    // viem's strict TypedData generics don't line up with our concrete
    // ExactTypedData shape; the runtime call is identical.
    const signTypedData: ExactSigner = (typedData) => account.signTypedData(typedData as never);
    const signHash = (hash: `0x${string}`) => account.sign({ hash });
    return new Eip3009EoaPayer(account.address, signTypedData, signHash);
  }

  async pay(requirement: X402PaymentRequirement, opts?: BuildExactOptions): Promise<X402PaymentPayload> {
    const sign = (await this.isDelegated(requirement.network)) ? this.wrappedSigner() : this.signTypedData;
    return buildExactPayment(requirement, this.address, sign, opts);
  }

  /**
   * True once the EOA carries an EIP-7702 delegation designator on-chain, which
   * decides whether USDC will route this signature through ecrecover or
   * EIP-1271, and so which of the two signatures to produce.
   *
   * Throws rather than guessing when the chain cannot be read. Guessing raw was
   * the old default, from when a session was usually never delegated; a session
   * is delegated from its first userOp now, so the guess is wrong nearly every
   * time it is made. And the guess is not free: a raw signature against a
   * delegated account is refused by the settlement endpoint, which reads as a
   * failed payment, and a failed payment counts against the session cap on the
   * grounds that the facilitator may have broadcast it anyway. It cannot have,
   * since USDC rejects the signature, so guessing spends the user's budget on a
   * payment that could never have settled. Refusing before signing costs a
   * retry instead.
   */
  private async isDelegated(network: string): Promise<boolean> {
    const asset = usdcForNetwork(network);
    if (!asset) return false;
    const code = await publicClientFor(asset.chainId).getCode({ address: this.address });
    return (code ?? '0x').toLowerCase().startsWith(EIP7702_CODE_PREFIX);
  }

  /**
   * ERC-7739 wrapped signer for the delegated (EIP-1271) validation path.
   *
   * JustanAccount answers 1271 with Solady's ERC-7739 validation, which rejects
   * raw signatures from on-chain callers by design (anti cross-account replay).
   * So the key signs a nested TypedDataSign envelope carrying the account's own
   * domain, and ships a blob the account unwraps. USDC v2.2 accepts
   * arbitrary-length `bytes` signatures, so it travels on the normal x402 wire.
   *
   * The envelope and the blob come from viem, which derives the contents type
   * from the typed data instead of taking a hand-written string, so the type
   * cannot drift from what is being signed. `erc7739.vectors.test.ts` pins the
   * bytes both produce against a payment that settled on chain.
   */
  private wrappedSigner(): ExactSigner {
    return async (typedData: ExactTypedData) => {
      const verifierDomain = await this.readAccountDomain(typedData.domain.chainId);
      // viem's TypedData generics don't line up with our concrete shapes; the
      // runtime calls take exactly the typed data we already build.
      const digest = erc7739HashTypedData({ ...typedData, verifierDomain } as never);
      const signature = await this.signHash(digest);
      return wrapTypedDataSignature({ ...typedData, signature } as never);
    };
  }

  /** Read (once per chain) the delegate's EIP-712 domain from the account. */
  private async readAccountDomain(chainId: number): Promise<AccountEip712Domain> {
    const cached = this.accountDomainByChain.get(chainId);
    if (cached) return cached;
    const [, name, version, domainChainId, verifyingContract, salt] = await publicClientFor(chainId).readContract({
      address: this.address,
      abi: EIP712_DOMAIN_ABI,
      functionName: 'eip712Domain',
    });
    const domain: AccountEip712Domain = { name, version, chainId: domainChainId, verifyingContract, salt };
    this.accountDomainByChain.set(chainId, domain);
    return domain;
  }
}

/**
 * The address pull-mode payments are made from, which is the session key's own
 * EOA and also the session address: the EOA is the session account, upgraded in
 * place. This is the address that must hold USDC for `jaw_pay_and_fetch` to
 * pay; expose it so a user/agent knows where the funds end up. Derives the
 * public address only (no signing, no key exposure). Throws if no session key
 * exists.
 */
export function sessionPayerAddress(): `0x${string}` {
  if (!keystoreExists()) {
    throw new Error('No session key. Run `jaw session setup` first.');
  }
  return privateKeyToAccount(loadSessionKey() as `0x${string}`).address;
}
