// Demo funding config, shared by the /api/fund route and the client.

// Circle's USDC on Base Sepolia (6 decimals) — same token the demo spends.
export const USDC_ADDRESS = '0x036CbD53842c5426634e7929541eC2318f3dCF7e';

// The full tour spends 0.2 (splits) + 0.2 (swap) USDC plus ERC-20 paymaster
// gas. An account holding at least this much can finish the tour — skip.
export const ALREADY_FUNDED_USDC = '0.5';
// Top-up for fresh accounts: spends + gas headroom.
export const FUND_AMOUNT_USDC = '1';
// Refuse to fund below this treasury balance so the demo never half-funds.
export const FUNDER_FLOOR_USDC = '2';

/** POST the address to /api/fund; resolves with {skipped} or {txHash}. */
export async function fundAccount(address: string): Promise<{ skipped?: boolean; txHash?: string }> {
  const res = await fetch('/api/fund', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ address }),
  });
  const json = (await res.json().catch(() => ({}))) as { skipped?: boolean; txHash?: string; error?: string };
  if (!res.ok) throw new Error(json.error || 'Funding failed');
  return json;
}
