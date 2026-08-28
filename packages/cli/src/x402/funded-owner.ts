import { usdcForNetwork } from './asset-registry.js';
import { usdcBalance } from './balance.js';
import { gasReserve } from './gas-reserve.js';
import { formatUsdc } from './status-report.js';

/**
 * Why a session cannot be set up yet, or null when it can.
 *
 * The grant carries a small transfer to the session account, so its first
 * operation can pay its own fee instead of needing someone to sponsor it, and
 * that transfer comes out of the account approving the permission. Granting
 * anyway leaves a permission that cannot be used until the account is funded and
 * the whole setup is run again, which revokes and re-grants.
 *
 * The account is only knowable here: it is whichever one the user connects with
 * in the browser, and the grant response is what would otherwise report it.
 */
export interface OwnerFundingCheck {
  chainId: number;
  /** The open browser bridge, asked for the connected account. */
  request(method: string, params?: unknown): Promise<unknown>;
  /** Injected for tests. */
  readBalance?: (network: string, owner: `0x${string}`) => Promise<bigint>;
}

export async function whyOwnerCannotFundSession(check: OwnerFundingCheck): Promise<string | null> {
  const asset = usdcForNetwork(`eip155:${check.chainId}`);
  // No USDC on this chain is no x402 grant to fund, and the preset would not
  // have built one either.
  if (!asset) return null;

  const accounts = (await check.request('eth_requestAccounts')) as string[] | undefined;
  const owner = accounts?.[0];
  if (!owner) return null;

  const read =
    check.readBalance ??
    (async (network: string, address: `0x${string}`) => BigInt((await usdcBalance(network, address)).raw));

  let held: bigint;
  try {
    held = await read(asset.wireNetwork, owner as `0x${string}`);
  } catch {
    // An unreachable RPC is not a reason to refuse a grant. This check exists to
    // fail early with a readable message; the wallet makes the same one against
    // its own node before building the transfer, and skips it when the account
    // cannot cover it. Losing the early warning costs a clearer error, not the
    // guarantee.
    return null;
  }

  const needed = gasReserve(asset);
  if (held >= needed) return null;

  return (
    `${owner} holds ${formatUsdc(held.toString(), asset.decimals)} on chain ${check.chainId}, and setting up a ` +
    `session needs at least ${formatUsdc(needed.toString(), asset.decimals)} there. That much rides along in the ` +
    'grant so the session can pay for its own first transaction. Fund the account and run this again.'
  );
}

/**
 * Why the session cannot pay for anything yet, or null when it can.
 *
 * The counterpart to the check above, on the other side of the grant. That one
 * refuses to grant when the account could not afford to seed the session; this
 * one runs after a grant the account could afford, and catches the case where
 * the seed never arrived anyway.
 *
 * It arrives, or does not, entirely at the wallet's discretion. The grant asks
 * for it through `capabilities.prefundSpender`, and a capability a wallet does
 * not implement is dropped rather than refused, so a wallet running an older
 * build honours nothing and reports nothing. What the user sees without this is
 * a successful setup followed, at the first payment, by an error about sizing a
 * paymaster approval.
 *
 * Only an empty balance counts. The wallet prices the seed itself, off its own
 * paymaster's rate, so any amount above zero means it did the thing and second
 * guessing the figure here would invent false alarms.
 */
export interface SpenderFundingCheck {
  chainId: number;
  /** The session account, which is the one that will send and be charged. */
  spender: `0x${string}`;
  /** Injected for tests. */
  readBalance?: (network: string, address: `0x${string}`) => Promise<bigint>;
}

export async function whySpenderCannotPay(check: SpenderFundingCheck): Promise<string | null> {
  const asset = usdcForNetwork(`eip155:${check.chainId}`);
  // No USDC on this chain means no ERC-20 paymaster to charge, so gas comes
  // from the native balance and an empty USDC balance says nothing.
  if (!asset) return null;

  const read =
    check.readBalance ??
    (async (network: string, address: `0x${string}`) => BigInt((await usdcBalance(network, address)).raw));

  let held: bigint;
  try {
    held = await read(asset.wireNetwork, check.spender);
  } catch {
    // The session exists and is saved by the time this runs. An unreachable
    // node is not a reason to end a successful setup with an alarm.
    return null;
  }
  if (held > 0n) return null;

  const needed = gasReserve(asset);
  return (
    `${check.spender} holds no USDC, so it cannot pay for its first operation. The session pays its ` +
    `own gas, and the grant asked this wallet to send it a little along with the permission. It did ` +
    `not, which means it does not support that yet: a capability a wallet does not know is dropped ` +
    `rather than reported. Send ${formatUsdc(needed.toString(), asset.decimals)} on chain ` +
    `${check.chainId} to that address and the session works from there.`
  );
}
