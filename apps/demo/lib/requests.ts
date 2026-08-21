import { getJaw } from './jaw';

type JawProvider = NonNullable<ReturnType<typeof getJaw>>['provider'];

// Circle's USDC on Base Sepolia (6 decimals).
const USDC = '0x036CbD53842c5426634e7929541eC2318f3dCF7e';
const BASE_SEPOLIA_HEX = '0x14a34';

// The two "friends" the splits screen settles up with. The mock UI shows its
// own names/amounts — the real batch just has to be a genuine 2-recipient
// transfer, not match the pixels.
const RECIPIENTS = [
  '0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045',
  '0x000000000000000000000000000000000000dEaD',
] as const;

// 0.1 USDC
const TENTH_USDC = 100000n;

// Uniswap v3 on Base Sepolia — verified on-chain: the USDC/WETH 0.3% pool
// (0x46880b…) holds the deepest liquidity, and SwapRouter02 has code.
const SWAP_ROUTER = '0x94cC0AaC535CCDB3C01d6787D6413C739ae12bc4';
const WETH = '0x4200000000000000000000000000000000000006';
const POOL_FEE = 3000n;
// 0.2 USDC
const FIFTH_USDC = 200000n;

// 32-byte ABI word from an address or uint.
function word(v: bigint | string): string {
  return typeof v === 'bigint'
    ? v.toString(16).padStart(64, '0')
    : v.toLowerCase().replace(/^0x/, '').padStart(64, '0');
}

// ERC-20 approve(address,uint256) — selector 095ea7b3.
function erc20Approve(spender: string, amount: bigint): `0x${string}` {
  return `0x095ea7b3${word(spender)}${word(amount)}`;
}

// SwapRouter02 exactInputSingle((address,address,uint24,address,uint256,uint256,uint160))
// — selector 04e45aaf; the struct is static, so it inlines as 7 words.
function exactInputSingle(recipient: string): `0x${string}` {
  return `0x04e45aaf${word(USDC)}${word(WETH)}${word(POOL_FEE)}${word(recipient)}${word(FIFTH_USDC)}${word(0n)}${word(0n)}`;
}

/**
 * Swap screen "Review swap": one atomic batch — approve 0.2 USDC to the Uniswap
 * router, then swap it for WETH via the 0.3% pool. amountOutMinimum is 0
 * (testnet demo; no MEV to guard against).
 */
export function sendSwapBatch(provider: JawProvider, recipient: string) {
  return provider.request({
    method: 'wallet_sendCalls',
    params: [
      {
        version: '2.0.0',
        chainId: BASE_SEPOLIA_HEX,
        atomicRequired: true,
        calls: [
          { to: USDC, data: erc20Approve(SWAP_ROUTER, FIFTH_USDC) },
          { to: SWAP_ROUTER, data: exactInputSingle(recipient) },
        ],
      },
    ],
  });
}

// The demo "agent" the Agens screen delegates to.
const AGENT = '0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045';
// Native ETH sentinel used by the permissions contract.
const NATIVE_ETH = '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE';
// 25 USDC (6 decimals) / 0.01 ETH (18 decimals)
const USDC_DAILY_CAP = '0x17d7840';
const ETH_MONTHLY_CAP = '0x2386f26fc10000';

/**
 * Agent screen "Delegate to agent": ERC-7715 grant — the agent may spend up to
 * 25 USDC per DAY and 0.01 ETH per MONTH, and the whole permission expires
 * in 30 days. Enforced onchain by the permission manager, revocable anytime.
 */
export function sendAgentGrant(provider: JawProvider) {
  const expiry = Math.floor(Date.now() / 1000) + 30 * 24 * 60 * 60;
  return provider.request({
    method: 'wallet_grantPermissions',
    params: [
      {
        expiry,
        spender: AGENT,
        chainId: BASE_SEPOLIA_HEX,
        permissions: {
          // Allowed call targets: the USDC token contract and the Uniswap
          // SwapRouter02 — recognizable contracts whose names the dialog can
          // surface next to the raw addresses.
          calls: [
            { target: USDC, selector: '0xa9059cbb' }, // USDC.transfer
            { target: SWAP_ROUTER, selector: '0x04e45aaf' }, // exactInputSingle
          ],
          spends: [
            { token: USDC, allowance: USDC_DAILY_CAP, unit: 'day', multiplier: 1 },
            { token: NATIVE_ETH, allowance: ETH_MONTHLY_CAP, unit: 'month', multiplier: 1 },
          ],
        },
      },
    ],
  });
}

// Hand-rolled ERC-20 transfer(address,uint256) calldata — selector a9059cbb —
// so the demo needs no ABI library.
function erc20Transfer(to: string, amount: bigint): `0x${string}` {
  const addr = to.toLowerCase().replace(/^0x/, '').padStart(64, '0');
  const amt = amount.toString(16).padStart(64, '0');
  return `0xa9059cbb${addr}${amt}`;
}

/**
 * Splits "Settle All": one EIP-5792 batch sending 0.1 USDC to each of two
 * addresses atomically — one signature, two transfers, like settling a bill
 * with two friends at once.
 */
export function sendSplitsBatch(provider: JawProvider) {
  return provider.request({
    method: 'wallet_sendCalls',
    params: [
      {
        version: '2.0.0',
        chainId: BASE_SEPOLIA_HEX,
        atomicRequired: true,
        calls: RECIPIENTS.map((to) => ({
          to: USDC,
          data: erc20Transfer(to, TENTH_USDC),
        })),
      },
    ],
  });
}
