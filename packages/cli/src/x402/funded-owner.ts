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
