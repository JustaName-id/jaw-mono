import { BaseCommand } from '../../base-command.js';
import { keystoreExists } from '../../lib/keystore.js';
import { loadConfig } from '../../lib/config.js';
import { isLegacySession, liveOrphans, tryLoadSessionConfig } from '../../lib/session-config.js';
import { sessionPayerAddress } from '../../x402/payer.js';
import { usdcBalance } from '../../x402/balance.js';
import { sumSpentSince } from '../../x402/ledger.js';
import { resolveSessionX402Policy } from '../../x402/policy.js';
import { currentPeriodSpendOnChain } from '../../x402/spend-window.js';
import { describePeriod } from '../../x402/period.js';
import { parseBigInt } from '../../x402/amount.js';
import { USDC_BY_NETWORK } from '../../x402/asset-registry.js';
import { gasReserve } from '../../x402/gas-reserve.js';
import { formatUsdc, formatRemaining, diagnose } from '../../x402/status-report.js';
import { readLiveness, type PermissionLiveness } from '../../x402/permission-onchain.js';
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
    // Permissions this key still holds that the session does not name. The caps
    // below describe one permission; the payer's real authority is the sum, and
    // reporting only the current one understates it.
    const alsoHolds = liveOrphans(session.orphanedPermissions, now);

    // Network reads, all of them failing soft. The local half of the answer
    // (caps, spend, expiry) is still worth printing, and an unreachable RPC is
    // itself a useful thing to see.
    const [balances, liveness] = await Promise.all([
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
      readLiveness(session),
    ]);
    const [ownerBalance, payerBalance] = balances;

    const spent = sumSpentSince(payer, session.createdAt);

    const sessionCap = parseBigInt(policy.maxTotalPerSession);
    const decimals = asset?.decimals ?? 6;

    // The cap that actually mirrors the permission, and what is left of it right
    // now. Without this the report was silent about the only cap a grant-seeded
    // session enforces. Asked of the chain first, which knows about pulls this
    // CLI's ledger never saw.
    const periodSpend = await currentPeriodSpendOnChain(policy, payer, session);
    const periodCap = parseBigInt(policy.maxPerPeriod);
    const periodLabel = policy.period ? describePeriod(policy.period.unit, policy.period.multiplier) : null;

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
      periodCap,
      // Top-ups, not payments: the period cap mirrors the on-chain allowance
      // and the top-up is what draws it down, exactly as `topUpCeiling`
      // measures it. Payments lag by whatever float the payer still holds,
      // which kept this check quiet while the grant was already drained.
      periodSpent: periodSpend?.toppedUp ?? null,
      periodLabel,
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
          ...(alsoHolds.length > 0 ? { alsoHolds } : {}),
          owner: { address: session.ownerAddress, usdc: ownerBalance },
          payer: { address: payer, usdc: payerBalance },
          policy: {
            maxAmountPerPayment: policy.maxAmountPerPayment,
            maxTotalPerSession: policy.maxTotalPerSession,
            maxPerPeriod: policy.maxPerPeriod,
            period: policy.period,
            topUpFloat: policy.topUpFloat,
          },
          spentThisSession: spent.toString(),
          ...(periodSpend
            ? {
                // Same meter as the diagnose input above: what the on-chain
                // allowance actually lost, so a script sees the grant drain.
                spentThisPeriod: periodSpend.toppedUp.toString(),
                // Where that figure came from. From the ledger it is a floor,
                // from the chain it is what the contract will meter against.
                spentThisPeriodSource: periodSpend.source,
                periodEndsAt: new Date(periodSpend.window.end * 1000).toISOString(),
              }
            : {}),
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
    if (alsoHolds.length > 0) {
      this.log(
        `          this key also holds ${alsoHolds.length} permission${alsoHolds.length === 1 ? '' : 's'} ` +
          'the caps below do not cover; `jaw session revoke` removes them too'
      );
    }
    this.log(`  caps    ${formatUsdc(policy.maxAmountPerPayment, decimals)} per payment`);
    // The granted cap first: it is the one the chain enforces, and the one a
    // refusal will quote back.
    //
    // The period figure counts top-ups where the session figure counts
    // payments, because the two caps meter different things: `maxPerPeriod`
    // mirrors the on-chain allowance, and the top-up is what draws that down.
    // Counting payments here understated the grant by whatever float the payer
    // still held: one 0.1 USDC payment behind a 5 USDC top-up printed 0.1
    // against a cap the chain had already docked 5 from.
    //
    // "at least" is dropped only for a period figure the contract answered.
    // Everything summed from the local ledger is a floor: the ledger sees what
    // went through `payAndFetch`, and the same permission can be spent by a
    // `wallet_sendCalls` sent through `jaw_rpc`, which writes no row.
    if (policy.maxPerPeriod !== undefined && periodLabel) {
      const usedThisPeriod = periodSpend?.toppedUp ?? 0n;
      const resets = periodSpend ? ` (resets ${new Date(periodSpend.window.end * 1000).toISOString()})` : '';
      const floor = periodSpend?.source === 'chain' ? '' : 'at least ';
      this.log(
        `          ${floor}${formatUsdc(usedThisPeriod.toString(), decimals)} of ${formatUsdc(policy.maxPerPeriod, decimals)} used this ${periodLabel}${resets}`
      );
    }
    this.log(
      `          at least ${formatUsdc(spent.toString(), decimals)} of ${formatUsdc(policy.maxTotalPerSession, decimals)} spent this session`
    );
    this.log(
      periodSpend?.source === 'chain'
        ? "          the session figure is counted from this CLI's ledger, which a direct jaw_rpc send bypasses"
        : "          counted from this CLI's ledger, which a direct jaw_rpc send bypasses"
    );
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
