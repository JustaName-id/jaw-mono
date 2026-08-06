import { Args, Flags } from '@oclif/core';
import { BaseCommand } from '../../base-command.js';
import { loadConfig } from '../../lib/config.js';
import { tryLoadSessionConfig } from '../../lib/session-config.js';
import { SessionBridge } from '../../lib/session-bridge.js';
import { Eip3009EoaPayer } from '../../x402/payer.js';
import { payAndFetch } from '../../x402/http.js';
import { appendX402Log, readX402Log } from '../../x402/ledger.js';
import { resolveX402Policy } from '../../x402/policy.js';
import { ensurePayerFunds } from '../../x402/topup.js';
import { parseBigInt, parseNonNegativeBigInt } from '../../x402/amount.js';
import { USDC_BY_NETWORK } from '../../x402/asset-registry.js';
import { formatUsdc } from '../../x402/status-report.js';
import type { OutputFormat } from '../../lib/types.js';
import type { X402PaymentRequirement } from '../../x402/types.js';

/**
 * The same request an agent makes, from a terminal.
 *
 * Everything x402 was reachable only through MCP, so a broken setup could not be
 * told apart from a broken MCP client. This runs the identical `payAndFetch`
 * path the tool runs: if it works here, it works there.
 *
 * Dry run is the default. A command named `pay` that spends on first use is the
 * wrong default for something whose main job is verification, and the read-only
 * half answers most questions on its own.
 */
export default class X402Pay extends BaseCommand {
  static override description =
    'Fetch a URL, paying an x402 challenge with the session key. Dry run by default: pass --pay to actually spend.';

  static override examples = [
    '<%= config.bin %> x402 pay https://api.example.com/resource',
    '<%= config.bin %> x402 pay https://api.example.com/resource --pay',
    '<%= config.bin %> x402 pay https://api.example.com/resource --pay --max-amount 50000',
  ];

  static override args = {
    url: Args.string({ description: 'Resource URL to fetch', required: true }),
  };

  static override flags = {
    ...BaseCommand.baseFlags,
    pay: Flags.boolean({
      description: 'Actually sign and send the payment. Without this the command stops before spending.',
      default: false,
    }),
    'max-amount': Flags.string({
      description: 'Hard ceiling in base units for this call, on top of the configured policy.',
    }),
    method: Flags.string({ description: 'HTTP method (default GET).' }),
    body: Flags.string({ description: 'Request body.' }),
  };

  async run(): Promise<void> {
    const { args, flags } = await this.parse(X402Pay);
    const format = flags.output as OutputFormat;
    const config = loadConfig();

    // Throws a clear "run jaw session setup" when there is no session key.
    const payer = Eip3009EoaPayer.fromSessionKey();
    const session = tryLoadSessionConfig();
    const policy = resolveX402Policy(config.x402);

    const spent = session ? sumSpent(payer.address, session.createdAt) : 0n;

    // Only wired for a real payment: a dry run returns before the funding hook,
    // so building a bridge for it would open a connection nothing uses.
    let ensureFunds;
    if (flags.pay && session && config.apiKey) {
      const bridge = new SessionBridge({ apiKey: config.apiKey, chainId: session.chainId });
      const floatTarget = parseNonNegativeBigInt(config.x402?.topUpFloat);
      const maxTopUp = parseNonNegativeBigInt(policy.maxTotalPerSession);
      ensureFunds = (requirement: X402PaymentRequirement, payerAddress: `0x${string}`) =>
        ensurePayerFunds(requirement, payerAddress, bridge, {
          floatTarget,
          maxTopUp,
          sessionChainId: session.chainId,
        });
    }

    const result = await payAndFetch(args.url, payer, {
      method: flags.method,
      body: flags.body,
      policy,
      ensureFunds,
      spentThisSession: spent,
      maxAmount: flags['max-amount'],
      dryRun: !flags.pay,
    });

    // Only a real run touches the ledger. Recording dry runs would corrupt the
    // spend totals that both this command and the agent read back.
    if (flags.pay) {
      const settled = result.payment ?? result.attemptedPayment;
      const isPaymentEvent =
        result.paid || !!result.attemptedPayment || (result.status === 402 && !!result.refusedReason);
      if (isPaymentEvent) {
        // Field for field what the MCP handler writes: both read each other's
        // entries back for the session spend total, so a divergence here would
        // make the two disagree about what has been spent.
        appendX402Log({
          at: new Date().toISOString(),
          url: args.url,
          payer: result.payer,
          status: result.paid ? 'paid' : result.attemptedPayment ? 'failed' : 'refused',
          amount: settled?.amount,
          asset: settled?.asset,
          network: settled?.network,
          payTo: settled?.payTo,
          nonce: settled?.nonce,
          txHash: result.payment?.txHash,
          topUpAmount: result.topUp?.amount,
          topUpBatchId: result.topUp?.batchId,
          reason: result.refusedReason,
        });
      }
    }

    if (format === 'json') {
      this.outputResult({ ...result, dryRun: !flags.pay }, format);
      return;
    }

    const decimals = Object.values(USDC_BY_NETWORK).find((a) => a.chainId === session?.chainId)?.decimals ?? 6;

    if (result.refusedReason) {
      this.log(`Refused.\n\n  ${result.refusedReason}`);
      if (result.topUp?.batchId) {
        // Money moved before the refusal. Never let that scroll past silently.
        this.log(
          `\n  A top-up of ${formatUsdc(result.topUp.amount, decimals)} was sent first (${result.topUp.batchId}).`
        );
      }
      this.exit(1);
    }

    if (result.wouldPay) {
      this.log('Would pay.\n');
      this.log(`  price    ${formatUsdc(result.wouldPay.amount, decimals)} on ${result.wouldPay.network}`);
      this.log(`  payTo    ${result.wouldPay.payTo}`);
      this.log(`  from     ${payer.address}`);
      this.log('\nNothing was signed or spent. Re-run with --pay to go through with it.');
      return;
    }

    if (!result.paid) {
      this.log(`${result.status} (no payment required)`);
      this.logBody(result.body);
      return;
    }

    this.log('Paid.\n');
    this.log(`  amount   ${formatUsdc(result.payment?.amount, decimals)} on ${result.payment?.network}`);
    this.log(`  payTo    ${result.payment?.payTo}`);
    if (result.topUp) {
      this.log(`  top-up   ${formatUsdc(result.topUp.amount, decimals)} pulled from the owner account`);
    }
    if (result.payment?.txHash) {
      this.log(`  tx       ${result.payment.txHash}`);
    }
    this.log(`\n${result.status} OK`);
    this.logBody(result.body);
  }

  private logBody(body: unknown): void {
    if (body === undefined || body === null || body === '') return;
    this.log('');
    this.log(typeof body === 'string' ? body : JSON.stringify(body, null, 2));
  }
}

/** Session-scoped spend from the ledger, same accounting the MCP tool uses. */
function sumSpent(payerAddress: string, since: string): bigint {
  const payer = payerAddress.toLowerCase();
  return readX402Log().reduce((total, entry) => {
    if ((entry.status !== 'paid' && entry.status !== 'failed') || !entry.amount) return total;
    if (entry.payer?.toLowerCase() !== payer) return total;
    if (entry.at < since) return total;
    const amount = parseBigInt(entry.amount);
    return amount !== null ? total + amount : total;
  }, 0n);
}
