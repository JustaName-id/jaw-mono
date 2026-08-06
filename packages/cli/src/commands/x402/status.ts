import { BaseCommand } from '../../base-command.js';
import { keystoreExists } from '../../lib/keystore.js';
import { loadConfig } from '../../lib/config.js';
import { tryLoadSessionConfig } from '../../lib/session-config.js';
import { sessionPayerAddress } from '../../x402/payer.js';
import { usdcBalance } from '../../x402/balance.js';
import { readX402Log } from '../../x402/ledger.js';
import { resolveX402Policy } from '../../x402/policy.js';
import { parseBigInt } from '../../x402/amount.js';
import { USDC_BY_NETWORK } from '../../x402/asset-registry.js';
import { formatUsdc, formatRemaining, diagnose } from '../../x402/status-report.js';
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
    const policy = resolveX402Policy(config.x402);
    const now = Date.now() / 1000;
    const expired = session.expiry <= now;

    const asset = Object.values(USDC_BY_NETWORK).find((a) => a.chainId === session.chainId);
    const payer = sessionPayerAddress();

    // Balances are the only network reads here. A failure must not take the
    // command down: the local half of the answer (caps, spend, expiry) is still
    // worth printing, and an unreachable RPC is itself a useful thing to see.
    const balances = await Promise.all(
      [session.ownerAddress as `0x${string}`, payer].map(async (address) => {
        if (!asset) return null;
        try {
          return (await usdcBalance(asset.wireNetwork, address)).formatted;
        } catch {
          return null;
        }
      })
    );
    const [ownerBalance, payerBalance] = balances;

    const spent = readX402Log().reduce((total, entry) => {
      if ((entry.status !== 'paid' && entry.status !== 'failed') || !entry.amount) return total;
      if (entry.payer?.toLowerCase() !== payer.toLowerCase()) return total;
      if (entry.at < session.createdAt) return total;
      const amount = parseBigInt(entry.amount);
      return amount !== null ? total + amount : total;
    }, 0n);

    const sessionCap = parseBigInt(policy.maxTotalPerSession);
    const decimals = asset?.decimals ?? 6;

    if (format === 'json') {
      this.outputResult(
        {
          ready: !expired && ownerBalance !== null,
          chainId: session.chainId,
          owner: { address: session.ownerAddress, usdc: ownerBalance },
          payer: { address: payer, usdc: payerBalance },
          policy: {
            maxAmountPerPayment: policy.maxAmountPerPayment,
            maxTotalPerSession: policy.maxTotalPerSession,
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
    this.log(`  caps    ${formatUsdc(policy.maxAmountPerPayment, decimals)} per payment`);
    this.log(
      `          ${formatUsdc(spent.toString(), decimals)} of ${formatUsdc(policy.maxTotalPerSession, decimals)} spent this session`
    );
    if (policy.topUpFloat) {
      this.log(`  float   tops the payer up to ${formatUsdc(policy.topUpFloat, decimals)} when it runs short`);
    }
    this.log(
      `  expires ${new Date(session.expiry * 1000).toISOString()}${expired ? '' : ` (${formatRemaining(session.expiry - now)})`}`
    );

    // Lead with whatever is actually blocking a payment, most likely first.
    const problems = diagnose({
      expired,
      ownerAddress: session.ownerAddress,
      ownerBalance,
      payerBalance,
      hasAsset: asset !== undefined,
      spent,
      sessionCap,
    });

    if (problems.length > 0) {
      this.log('');
      for (const problem of problems) this.log(`  ! ${problem}`);
    }
  }
}

function fmt(balance: string | null): string {
  return balance === null ? '     ?    ' : `${balance} USDC`;
}
