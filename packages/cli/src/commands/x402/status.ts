import { BaseCommand } from '../../base-command.js';
import { keystoreExists } from '../../lib/keystore.js';
import { loadConfig } from '../../lib/config.js';
import { isLegacySession, liveOrphans, tryLoadSessionConfig } from '../../lib/session-config.js';
import { sessionPayerAddress } from '../../x402/payer.js';
import { usdcBalance } from '../../x402/balance.js';
import { sumSpentSince } from '../../x402/ledger.js';
import { resolveSessionX402Policy } from '../../x402/policy.js';
import { currentLimitUsageOnChain } from '../../x402/spend-window.js';
import { describePeriod } from '../../x402/period.js';
import { parseBigInt } from '../../x402/amount.js';
import { USDC_BY_NETWORK } from '../../x402/asset-registry.js';
import { gasReserve } from '../../x402/gas-reserve.js';
import { formatUsdc, formatRemaining, diagnose } from '../../x402/status-report.js';
import { readLiveness, type PermissionLiveness } from '../../x402/permission-onchain.js';
import { recoverPermission } from '../../x402/permission-recovery.js';
import type { OutputFormat } from '../../lib/types.js';

/**
 * Answer "is my x402 setup right?" without spending anything.
 *
 * The three things that break a setup are invisible until a payment fails:
 * funding the payer instead of the owner (payments then work, but the permission
 * is never exercised and the cap never applies), a permission that does not
 * match what you thought you granted, and a session cap already used up. All
 * three are readable state, so read them.
 */
export default class X402Status extends BaseCommand {
  static override description =
    'Show x402 payment readiness: which account holds the funds, the resolved caps, and what has been spent. Reads only, never pays.';

  static override examples = ['<%= config.bin %> x402 status', '<%= config.bin %> x402 status --output json'];

  static override flags = {
    ...BaseCommand.baseFlags,
  };

  async run(): Promise<void> {
    const { flags } = await this.parse(X402Status);
    const format = flags.output as OutputFormat;

    const session = keystoreExists() ? tryLoadSessionConfig() : null;
    if (!session) {
      if (format === 'json') {
        this.outputResult({ ready: false, reason: 'no session' }, format);
        return;
      }
      this.log('No session. Run `jaw session setup --x402` to create one.');
      return;
    }

    const config = loadConfig();
    // Seeded from the grant, exactly as the paying paths resolve it. Resolving
    // from config alone reported the 10-USDC default session cap that a
    // grant-seeded policy deletes, so status promised budget nothing enforced.
    const policy = resolveSessionX402Policy(config.x402, session);
    const now = Date.now() / 1000;
    const expired = session.expiry <= now;

    const asset = Object.values(USDC_BY_NETWORK).find((a) => a.chainId === session.chainId);
    const payer = sessionPayerAddress();
    // Permissions from earlier sessions that are still live on chain and that
    // the caps below do not describe. Said in terms of the permission rather
    // than of this key: setup generates a fresh key whenever it is not reusing
    // one, and `--yes` always does, so the key that could exercise these is
    // usually gone from this machine. What is left is a grant on the account
    // that nothing here meters and that outlives the session that made it.
    const stillLive = liveOrphans(session.orphanedPermissions, now);

    // Network reads, all of them failing soft. The local half of the answer
    // (caps, spend, expiry) is still worth printing, and an unreachable RPC is
    // itself a useful thing to see.
    const [balances, recovered] = await Promise.all([
      Promise.all(
        [session.ownerAddress as `0x${string}`, payer].map(async (address) => {
          if (!asset) return null;
          try {
            return (await usdcBalance(asset.wireNetwork, address)).formatted;
          } catch {
            return null;
          }
        })
      ),
      // Recovered first for a session written before the struct was stored,
      // which is otherwise stuck reporting "cannot tell" forever.
      recoverPermission(session, config.apiKey),
    ]);
    const [ownerBalance, payerBalance] = balances;
    // Threaded through the rest of the command, not just the liveness read.
    // Without this the run that performed the recovery still reported no period
    // figure, because the on-chain read takes the struct off the session object
    // and that one was still the version loaded from disk.
    const current = recovered ? { ...session, permission: recovered } : session;
    const liveness = await readLiveness(current);

    const spent = sumSpentSince(payer, session.createdAt);

    const sessionCap = parseBigInt(policy.maxTotalPerSession);
    const decimals = asset?.decimals ?? 6;

    // The cap that actually mirrors the permission, and what is left of it right
    // now. Without this the report was silent about the only cap a grant-seeded
    // session enforces. Asked of the chain first, which knows about pulls this
    // CLI's ledger never saw.
    // Every limit on the payment token, each with its own window and its own
    // usage. Reducing them to one was reporting a month's budget as a day's.
    const usage = await currentLimitUsageOnChain(policy, payer, current);
    // Joined onto the limits the policy holds, not read off the usage list. A
    // limit whose usage could not be computed is still enforced by
    // `checkPolicy`, and reporting only what has usage made it invisible here:
    // no line, no json entry, and a `ready: true` for a session whose grant is
    // the thing bounding it.
    const limits = (policy.perPeriod ?? []).map((limit) => {
      const measured = usage.find(
        (entry) =>
          entry.unit === limit.unit && entry.multiplier === limit.multiplier && entry.allowance === limit.allowance
      );
      return (
        measured ?? {
          ...limit,
          spent: 0n,
          toppedUp: 0n,
          endsAt: null,
          source: 'unmeasured' as const,
        }
      );
    });
    // The one with the least room left, which is what the verdict is about.
    // Picking the smallest allowance instead said `ready: true` for a session
    // whose month was drained, because today's counter was still at zero, right
    // under a printed line reading 100 of 100 USDC used this month.
    //
    // Unparseable allowances are skipped rather than thrown on: they reach here
    // from a config file someone can edit, and the rest of this command reports
    // a bad value instead of dying on it.
    const remaining = (limit: (typeof limits)[number]) => {
      const cap = parseBigInt(limit.allowance);
      if (cap === null) return null;
      return cap > limit.toppedUp ? cap - limit.toppedUp : 0n;
    };
    const tightest = limits.reduce<(typeof limits)[number] | null>((a, b) => {
      const left = remaining(b);
      if (left === null) return a;
      const best = a === null ? null : remaining(a);
      return best === null || left < best ? b : a;
    }, null);

    // One verdict for both renderers. `ready` used to be its own expression and
    // drifted from the warnings: a setup whose owner was empty printed a loud
    // "the cap is not applying" and still reported ready:true to a script.
    const problems = diagnose({
      expired,
      liveness,
      ownerAddress: session.ownerAddress,
      ownerBalance,
      payerBalance,
      hasAsset: asset !== undefined,
      spent,
      sessionCap,
      periodCap: tightest ? parseBigInt(tightest.allowance) : null,
      // Top-ups, not payments: the period cap mirrors the on-chain allowance
      // and the top-up is what draws it down, exactly as `topUpCeiling`
      // measures it. Payments lag by whatever float the payer still holds,
      // which kept this check quiet while the grant was already drained.
      periodSpent: tightest ? tightest.toppedUp : null,
      periodLabel: tightest ? describePeriod(tightest.unit, tightest.multiplier) : null,
      outdated: isLegacySession(session),
      // Same units as the formatted balances. Exact in a double: the reserve
      // is a tenth of a token, six decimals at most.
      payerReserve: asset ? Number(gasReserve(asset)) / 10 ** asset.decimals : 0,
    });

    if (format === 'json') {
      this.outputResult(
        {
          ready: problems.length === 0,
          problems,
          chainId: session.chainId,
          permission: { id: session.permissionId, onChain: liveness },
          ...(stillLive.length > 0 ? { stillLiveOnChain: stillLive } : {}),
          owner: { address: session.ownerAddress, usdc: ownerBalance },
          payer: { address: payer, usdc: payerBalance },
          policy: {
            maxAmountPerPayment: policy.maxAmountPerPayment,
            maxTotalPerSession: policy.maxTotalPerSession,
            // Every one of them: the contract charges all, and naming one as
            // the budget is what this set out to stop.
            perPeriod: limits.map((limit) => ({
              allowance: limit.allowance,
              unit: limit.unit,
              multiplier: limit.multiplier,
              used: limit.endsAt === null ? null : limit.toppedUp.toString(),
              usedFrom: limit.source,
              resetsAt: limit.endsAt === null ? null : limit.endsAt.toISOString(),
            })),
            topUpFloat: policy.topUpFloat,
          },
          spentThisSession: spent.toString(),

          expiry: session.expiry,
          expired,
        },
        format
      );
      return;
    }

    this.log(expired ? 'Session expired.\n' : 'Session active.\n');

    this.log(`  owner   ${session.ownerAddress}   ${fmt(ownerBalance)}   <- funds go here`);
    this.log(`  payer   ${payer}   ${fmt(payerBalance)}`);
    this.log('');
    this.log(`  chain   ${session.chainId}${asset ? '' : '   (no USDC configured for this chain)'}`);
    // Only printed when the chain answered. A line saying "unknown" on every
    // run of an older session is noise about a question nobody asked.
    if (liveness !== 'unknown') {
      this.log(`  perm    ${session.permissionId}   ${LIVENESS_LABEL[liveness]}`);
    }
    if (stillLive.length > 0) {
      this.log(
        `          ${stillLive.length} permission${stillLive.length === 1 ? '' : 's'} from earlier sessions ` +
          'still live on this account; `jaw session revoke` removes them too'
      );
    }
    this.log(`  caps    ${formatUsdc(policy.maxAmountPerPayment, decimals)} per payment`);
    // Every limit, each with its own window and reset. One of them used to
    // stand for all, which is how a 100-a-month cap was reported as 50 a day.
    for (const limit of limits) {
      const floor = limit.source === 'chain' ? '' : 'at least ';
      // A limit with no window is one whose usage could not be computed. It
      // still binds, so it is reported, and the missing figure is named as
      // missing rather than printed as a zero.
      const window = limit.endsAt === null ? ' (usage unknown)' : ` (resets ${limit.endsAt.toISOString()})`;
      const used = limit.endsAt === null ? '?' : `${floor}${formatUsdc(limit.toppedUp.toString(), decimals)}`;
      this.log(
        `          ${used} of ${formatUsdc(limit.allowance, decimals)} used this ` +
          `${describePeriod(limit.unit, limit.multiplier)}${window}`
      );
    }
    if (limits.length > 1) {
      this.log('          all of them apply, so the tightest is what binds');
    }
    this.log(
      `          at least ${formatUsdc(spent.toString(), decimals)} of ${formatUsdc(policy.maxTotalPerSession, decimals)} spent this session`
    );
    // The session total has no on-chain counterpart, so it is always a floor:
    // the ledger sees what went through payAndFetch, and a `wallet_sendCalls`
    // sent through jaw_rpc spends the same permission without writing a row.
    this.log("          the session figure is counted from this CLI's ledger, which a direct jaw_rpc send bypasses");
    if (policy.topUpFloat) {
      this.log(`  float   tops the payer up to ${formatUsdc(policy.topUpFloat, decimals)} when it runs short`);
    }
    this.log(
      `  expires ${new Date(session.expiry * 1000).toISOString()}${expired ? '' : ` (${formatRemaining(session.expiry - now)})`}`
    );

    // Most likely blocker first.
    if (problems.length > 0) {
      this.log('');
      for (const problem of problems) this.log(`  ! ${problem}`);
    }
  }
}

function fmt(balance: string | null): string {
  return balance === null ? '     ?    ' : `${balance} USDC`;
}

const LIVENESS_LABEL: Record<Exclude<PermissionLiveness, 'unknown'>, string> = {
  active: 'live on chain',
  revoked: 'REVOKED on chain',
  unapproved: 'not approved on chain',
  mismatch: 'does not match the stored permission',
};
