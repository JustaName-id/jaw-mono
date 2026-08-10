import { parseBigInt } from './amount.js';
import { sanitizeLine } from '../lib/terminal.js';

/**
 * Presentation and diagnosis for `jaw x402 status`, kept apart from the command
 * so the rules can be tested without a session, a keystore or a network.
 */

/** Base units to a readable amount, trailing zeros trimmed. */
export function formatUsdc(base: string | undefined, decimals: number): string {
  if (base === undefined) return 'unlimited';
  const value = parseBigInt(base);
  // Echoing the raw value put an unvalidated string on screen: amounts reach
  // here from the ledger and from config, both files that can be edited.
  if (value === null) return `${sanitizeLine(base, 32)} (invalid)`;
  const scale = 10n ** BigInt(decimals);
  const whole = value / scale;
  const frac = (value % scale).toString().padStart(decimals, '0').replace(/0+$/, '');
  return `${whole}${frac ? `.${frac}` : ''} USDC`;
}

export function formatRemaining(seconds: number): string {
  const days = Math.floor(seconds / 86400);
  if (days > 0) return `${days} day${days === 1 ? '' : 's'} left`;
  const hours = Math.max(0, Math.floor(seconds / 3600));
  return `${hours}h left`;
}

export interface StatusFacts {
  expired: boolean;
  ownerAddress: string;
  /** Formatted balance, or null when the read failed. */
  ownerBalance: string | null;
  payerBalance: string | null;
  /** False when the session's chain has no USDC in the registry. */
  hasAsset: boolean;
  spent: bigint;
  sessionCap: bigint | null;
  /**
   * The granted per-period cap and what has gone against it in the current
   * window. Null when no grant seeded one. Reported separately from the session
   * cap because a grant-seeded policy usually has no session cap at all, and
   * checking only that one stayed quiet while the cap that actually binds was
   * exhausted.
   */
  periodCap?: bigint | null;
  periodSpent?: bigint | null;
  /** How the window reads in a sentence, e.g. "day" or "2 weeks". */
  periodLabel?: string | null;
}

/**
 * What is stopping a payment, most likely cause first. Empty when nothing is.
 *
 * The interesting case is an empty owner next to a funded payer: payments still
 * succeed, so nothing looks wrong, but they are spending the payer's own balance
 * instead of pulling through the permission, which means the cap the user
 * granted is not being applied to anything.
 */
export function diagnose(facts: StatusFacts): string[] {
  const problems: string[] = [];

  if (facts.expired) {
    problems.push('The session expired. Run `jaw session setup --x402`.');
  }

  if (!facts.hasAsset) {
    problems.push('This chain has no USDC configured, so x402 payments cannot be made on it.');
  }

  if (facts.hasAsset && facts.ownerBalance === null) {
    // Blaming the connection while the other balance rendered fine reads as a
    // contradiction, so only do it when both reads failed.
    problems.push(
      facts.payerBalance === null
        ? 'Could not read balances. Check the API key and network.'
        : `Could not read the owner balance for ${facts.ownerAddress}. The address may be malformed.`
    );
  }

  if (facts.ownerBalance !== null && Number(facts.ownerBalance) === 0) {
    problems.push(
      facts.payerBalance !== null && Number(facts.payerBalance) > 0
        ? 'The owner account is empty but the payer holds USDC. Payments will work, but they bypass the ' +
            'permission, so the cap you granted is not applying. Move the funds to the owner.'
        : 'The owner account holds no USDC, so there is nothing to pay with.'
    );
  }

  // Before the session cap: this is the one that mirrors the permission, so when
  // both are exhausted it is the more useful thing to say, and it frees up on its
  // own rather than needing a config change.
  if (facts.periodCap != null && facts.periodSpent != null && facts.periodSpent >= facts.periodCap) {
    problems.push(
      `The granted allowance for this ${facts.periodLabel ?? 'period'} is used up. It resets at the end of ` +
        'the window, or grant a new permission with `jaw session setup --x402`.'
    );
  }

  if (facts.sessionCap !== null && facts.spent >= facts.sessionCap) {
    problems.push(
      'The session cap is used up. Raise it with `jaw config set x402.maxTotalPerSession <base units>` ' +
        'or start a new session.'
    );
  }

  return problems;
}
