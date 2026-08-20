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
