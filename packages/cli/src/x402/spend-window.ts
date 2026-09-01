import { currentPeriodWindow, type PeriodWindow } from './period.js';
import { sumSpentSince, sumToppedUpSince } from './ledger.js';
import { readCurrentPeriod, type ReadDeps } from './permission-onchain.js';
import { USDC_BY_NETWORK } from './asset-registry.js';
import type { X402Policy } from './policy.js';
import type { SessionConfig } from '../lib/session-config.js';

export interface PeriodSpend {
  /** The grant period containing `now`, clamped at the permission's expiry. */
  window: PeriodWindow;
  /** Base units the payer already spent inside that window. */
  spent: bigint;
  /**
   * Base units already pulled through the permission inside that window, which
   * is what actually drew down the on-chain allowance. The payments above only
   * approximate it while the payer still holds a float.
   */
  toppedUp: bigint;
  /**
   * Where `toppedUp` came from, which is what decides whether it is a floor or
   * a total: the ledger only sees what went through `payAndFetch`, while the
   * chain's figure is what the contract will meter against. It describes the
   * number and not the window, because the two can disagree: when the chain
   * answers, the window is always the contract's, and `toppedUp` is whichever
   * of the two figures is higher.
   */
  source: 'ledger' | 'chain';
}

/**
 * Locate the grant period containing now and total what the payer already spent
 * inside it. Null when the policy carries no period (no grant, or a grant whose
 * unit was not recorded), in which case only the session cap applies.
 *
 * Shared rather than computed per front end: a path that resolved a per-period
 * cap but skipped this checked every payment against a fresh allowance, which is
 * no cap at all once the first period's spend is on the ledger. Re-read on every
 * call, never cached, for the same reason the session total is: another process
 * holding the payment lock may have spent inside this window too.
 */
export function currentPeriodSpend(
  policy: X402Policy,
  payerAddress: string,
  session: { expiry: number } | null | undefined,
  now: Date = new Date()
): PeriodSpend | null {
  if (!session || !policy.period || policy.maxPerPeriod === undefined) return null;
  const anchorMs = Date.parse(policy.period.anchor);
  // A hand-edited anchor must degrade to "no period window", never throw and
  // take down every payment.
  if (Number.isNaN(anchorMs)) return null;
  const window = currentPeriodWindow({
    anchor: Math.floor(anchorMs / 1000),
    unit: policy.period.unit,
    multiplier: policy.period.multiplier,
    now: Math.floor(now.getTime() / 1000),
    permissionEnd: session.expiry,
  });
  const since = new Date(window.start * 1000).toISOString();
  return {
    window,
    spent: sumSpentSince(payerAddress, since),
    toppedUp: sumToppedUpSince(payerAddress, since),
    source: 'ledger',
  };
}

/**
 * The same figure, asked of the chain first.
 *
 * The ledger undercounts by construction: it sees what went through
 * `payAndFetch` and nothing else, so a pull made by a `wallet_sendCalls` sent
 * through `jaw_rpc`, by a second machine, or by a write that never landed is
 * missing from it. `topUpCeiling` sizes refills off this number, and the
 * contract meters the pull, so an undercount does not overspend the allowance.
 * It sends a userOp that reverts, and prints a budget larger than the one that
 * exists.
 *
 * `getCurrentPeriod` answers both halves at once: the window the contract is
 * currently in, and what that window has already lost.
 *
 * The two figures are combined rather than one replacing the other, because
 * each is ahead of the other in a different case. The chain is ahead when
 * something outside this CLI drew on the permission. The ledger is ahead when
 * our own top-up is signed and not yet mined, which is a pull the allowance is
 * about to lose. The larger of the two is the only one safe against both.
 *
 * Counted over the chain's window, so the ledger sum and the contract's figure
 * cover the same period instead of the contract's and a locally guessed one.
 */
export async function currentPeriodSpendOnChain(
  policy: X402Policy,
  payerAddress: string,
  session: SessionConfig | null | undefined,
  now: Date = new Date(),
  deps: ReadDeps = {}
): Promise<PeriodSpend | null> {
  const local = currentPeriodSpend(policy, payerAddress, session, now);
  if (!local || !session) return local;

  // The same token the policy was seeded from, resolved the same way: from the
  // registry, by the session's chain. Reading it off a stored summary is what
  // let this and the policy describe different budgets.
  const asset = Object.values(USDC_BY_NETWORK).find((a) => a.chainId === session.chainId);
  if (!asset) return local;

  const onChain = await readCurrentPeriod(
    {
      chainId: session.chainId,
      permissionId: session.permissionId,
      permission: session.permission,
      token: asset.address,
    },
    deps
  );
  // `outside-window` included: a permission the contract will not meter is one
  // the local window still describes, and expiry is reported on its own.
  if (onChain.status !== 'ok') return local;

  const window = { start: onChain.start, end: onChain.end };
  const since = new Date(window.start * 1000).toISOString();
  const fromLedger = sumToppedUpSince(payerAddress, since);
  // Which figure won decides the source, not the fact that the chain answered.
  // When the ledger wins, the number is our own estimate of a pull that has not
  // been mined yet, and calling it the contract's would print an estimate as a
  // metered total.
  const metered = onChain.spend >= fromLedger;
  return {
    window,
    spent: sumSpentSince(payerAddress, since),
    toppedUp: metered ? onChain.spend : fromLedger,
    source: metered ? 'chain' : 'ledger',
  };
}
