import { currentPeriodWindow, type PeriodWindow } from './period.js';
import { sumSpentSince, sumToppedUpSince } from './ledger.js';
import { readCurrentPeriod, type ReadDeps } from './permission-onchain.js';
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
   * Where the window and `toppedUp` came from. The ledger only sees what went
   * through `payAndFetch`, so from it both are floors; from the chain they are
   * the figures the contract will meter against.
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

  // The limit the policy was seeded from. A permission can carry more than one
  // limit for the same token, each with its own counter on chain, and this is
  // the one `extractGrantedSpend` picked.
  const token = session.grantedSpend?.token;
  if (!token) return local;

  const onChain = await readCurrentPeriod(
    {
      chainId: session.chainId,
      permissionId: session.permissionId,
      permission: session.permission,
      token,
    },
    deps
  );
  // `outside-window` included: a permission the contract will not meter is one
  // the local window still describes, and expiry is reported on its own.
  if (onChain.status !== 'ok') return local;

  const window = { start: onChain.start, end: onChain.end };
  const since = new Date(window.start * 1000).toISOString();
  const fromLedger = sumToppedUpSince(payerAddress, since);
  return {
    window,
    spent: sumSpentSince(payerAddress, since),
    toppedUp: onChain.spend > fromLedger ? onChain.spend : fromLedger,
    source: 'chain',
  };
}
