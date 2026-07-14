import { describe, expect, it } from 'vitest';
import { deriveTransferDeltas, type SimulatedLog } from './transferDeltas';

const TRANSFER = '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef';
const ACCOUNT = '0x71f2F1c2dc94cDaBFE29Cb355119f8683AE0969b';
const OTHER = '0x000000000000000000000000000000000000dEaD';
const ETH_PSEUDO = '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE';
const TOKEN = '0x0Bd7D308f8E1639FAb988df18A8011f41EAcAD73';

const pad = (address: string) => '0x' + address.slice(2).toLowerCase().padStart(64, '0');
const word = (n: bigint) => '0x' + n.toString(16).padStart(64, '0');

function transfer(emitter: string, from: string, to: string, value: bigint): SimulatedLog {
  return { address: emitter, topics: [TRANSFER, pad(from), pad(to)], data: word(value) };
}

describe('deriveTransferDeltas', () => {
  it('nets incoming and outgoing transfers per emitting address', () => {
    const deltas = deriveTransferDeltas(
      [
        transfer(TOKEN, ACCOUNT, OTHER, 250n),
        transfer(ETH_PSEUDO, OTHER, ACCOUNT, 100n),
        transfer(ETH_PSEUDO, OTHER, ACCOUNT, 25n),
      ],
      ACCOUNT
    );
    expect(deltas).toEqual([
      { address: TOKEN.toLowerCase(), diff: -250n },
      { address: ETH_PSEUDO.toLowerCase(), diff: 125n },
    ]);
  });

  it('drops addresses whose transfers net to zero', () => {
    const deltas = deriveTransferDeltas(
      [transfer(TOKEN, ACCOUNT, OTHER, 50n), transfer(TOKEN, OTHER, ACCOUNT, 50n)],
      ACCOUNT
    );
    expect(deltas).toEqual([]);
  });

  it('ignores transfers not involving the account, non-Transfer logs, and indexed-value transfers', () => {
    const deltas = deriveTransferDeltas(
      [
        transfer(TOKEN, OTHER, OTHER, 999n),
        { address: TOKEN, topics: ['0x' + 'ab'.repeat(32), pad(ACCOUNT), pad(OTHER)], data: word(1n) },
        { address: TOKEN, topics: [TRANSFER, pad(OTHER), pad(ACCOUNT), word(7n)], data: '0x' },
      ],
      ACCOUNT
    );
    expect(deltas).toEqual([]);
  });

  it('matches the account case-insensitively', () => {
    const deltas = deriveTransferDeltas([transfer(TOKEN, OTHER, ACCOUNT, 5n)], ACCOUNT.toLowerCase());
    expect(deltas).toEqual([{ address: TOKEN.toLowerCase(), diff: 5n }]);
  });
});
