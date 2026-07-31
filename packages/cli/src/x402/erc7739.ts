import { concat, encodeAbiParameters, getTypesForEIP712Domain, hashDomain, keccak256, pad, toBytes, toHex } from 'viem';
import type { ExactTypedData } from './scheme-exact-evm.js';

/**
 * ERC-7739 (Solady nested EIP-712, the "TypedDataSign" workflow) wrapping for
 * EIP-3009 authorizations.
 *
 * Once the session EOA is delegated via EIP-7702 it has code, so USDC routes
 * `transferWithAuthorization` signatures through EIP-1271 instead of ecrecover.
 * JustanAccount answers 1271 with Solady's ERC-7739 validation, which rejects
 * raw signatures from on-chain callers by design (anti cross-account replay).
 * The payer must therefore sign the nested TypedDataSign envelope and ship the
 * wrapped blob; USDC v2.2 accepts arbitrary-length `bytes` signatures, so the
 * blob travels on the normal x402 wire. Validated end to end on Base Sepolia:
 * on-chain 1271 acceptance plus a real facilitator verify + settle.
 */

/** The EIP-712 domain of the delegated account (JustanAccount via 7702). */
export interface AccountEip712Domain {
  name: string;
  version: string;
  chainId: bigint;
  verifyingContract: `0x${string}`;
  salt: `0x${string}`;
}

const CONTENTS_TYPE =
  'TransferWithAuthorization(address from,address to,uint256 value,uint256 validAfter,uint256 validBefore,bytes32 nonce)';
const CONTENTS_TYPEHASH = keccak256(toHex(CONTENTS_TYPE));

// TypedDataSign(<ContentsName> contents, ...account domain fields...)<ContentsType>
// Field order matters: `contents` comes before the domain fields.
const TYPED_DATA_SIGN_TYPE =
  'TypedDataSign(TransferWithAuthorization contents,string name,string version,uint256 chainId,address verifyingContract,bytes32 salt)' +
  CONTENTS_TYPE;
const TYPED_DATA_SIGN_TYPEHASH = keccak256(toHex(TYPED_DATA_SIGN_TYPE));

/** Struct hash of the EIP-3009 TransferWithAuthorization contents. */
export function contentsHashOf(message: ExactTypedData['message']): `0x${string}` {
  return keccak256(
    encodeAbiParameters(
      [
        { type: 'bytes32' },
        { type: 'address' },
        { type: 'address' },
        { type: 'uint256' },
        { type: 'uint256' },
        { type: 'uint256' },
        { type: 'bytes32' },
      ],
      [
        CONTENTS_TYPEHASH,
        message.from,
        message.to,
        message.value,
        message.validAfter,
        message.validBefore,
        message.nonce,
      ]
    )
  );
}

/**
 * The digest the EOA key actually signs:
 * keccak256(0x1901 ‖ APP_DOMAIN_SEPARATOR ‖ hashStruct(TypedDataSign{...})).
 * The app domain is the token's (USDC); the envelope carries the ACCOUNT's
 * domain so the signature cannot replay across accounts sharing the key.
 */
export function erc7739Digest(
  typedData: ExactTypedData,
  accountDomain: AccountEip712Domain
): { digest: `0x${string}`; appDomainSeparator: `0x${string}`; contentsHash: `0x${string}` } {
  // viem's TypedData generics don't line up with our concrete domain shape;
  // the runtime call is the standard EIP-712 domain hash.
  const appDomainSeparator = hashDomain({
    domain: typedData.domain,
    types: { EIP712Domain: getTypesForEIP712Domain({ domain: typedData.domain }) },
  } as never) as `0x${string}`;
  const contentsHash = contentsHashOf(typedData.message);
  const envelopeStructHash = keccak256(
    encodeAbiParameters(
      [
        { type: 'bytes32' },
        { type: 'bytes32' },
        { type: 'bytes32' },
        { type: 'bytes32' },
        { type: 'uint256' },
        { type: 'address' },
        { type: 'bytes32' },
      ],
      [
        TYPED_DATA_SIGN_TYPEHASH,
        contentsHash,
        keccak256(toHex(accountDomain.name)),
        keccak256(toHex(accountDomain.version)),
        accountDomain.chainId,
        accountDomain.verifyingContract,
        accountDomain.salt,
      ]
    )
  );
  const digest = keccak256(concat(['0x1901', appDomainSeparator, envelopeStructHash]));
  return { digest, appDomainSeparator, contentsHash };
}

/**
 * Assemble the wire blob the verifier unwraps:
 * sig(65) ‖ APP_DOMAIN_SEPARATOR(32) ‖ contentsHash(32) ‖ contentsType ‖ uint16(len).
 * Implicit mode: the contents description is the contents type itself.
 */
export function wrapErc7739Signature(
  signature: `0x${string}`,
  appDomainSeparator: `0x${string}`,
  contentsHash: `0x${string}`
): `0x${string}` {
  const contentsTypeBytes = toBytes(CONTENTS_TYPE);
  return concat([
    signature,
    appDomainSeparator,
    contentsHash,
    toHex(contentsTypeBytes),
    pad(toHex(contentsTypeBytes.length), { size: 2 }),
  ]);
}
