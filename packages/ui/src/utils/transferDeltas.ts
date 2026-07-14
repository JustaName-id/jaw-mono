/** Minimal log shape shared by viem's simulateCalls results. */
export interface SimulatedLog {
  address: string;
  topics: readonly string[];
  data: string;
}

export interface TransferDelta {
  /** Lowercased emitting address. */
  address: string;
  /** Net change for the account: positive = received, negative = sent. */
  diff: bigint;
}

const TRANSFER_TOPIC = '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef';

function topicToAddress(topic: string): string {
  return ('0x' + topic.slice(-40)).toLowerCase();
}

/**
 * Aggregate `Transfer(address,address,uint256)` logs from a simulation into net per-address
 * deltas for `account`. Used for the native-ETH pseudo-logs that `traceTransfers` emits
 * (value in `data`, ETH pseudo-address as emitter). Entries netting to zero are dropped.
 */
export function deriveTransferDeltas(logs: readonly SimulatedLog[], account: string): TransferDelta[] {
  const accountLower = account.toLowerCase();
  const deltas = new Map<string, bigint>();

  for (const log of logs) {
    if (log.topics[0] !== TRANSFER_TOPIC || log.topics.length !== 3) continue;
    const value = log.data && log.data !== '0x' ? BigInt(log.data) : 0n;
    if (value === 0n) continue;

    let diff = 0n;
    if (topicToAddress(log.topics[2]) === accountLower) diff += value;
    if (topicToAddress(log.topics[1]) === accountLower) diff -= value;
    if (diff === 0n) continue;

    const address = log.address.toLowerCase();
    deltas.set(address, (deltas.get(address) ?? 0n) + diff);
  }

  return [...deltas.entries()].filter(([, diff]) => diff !== 0n).map(([address, diff]) => ({ address, diff }));
}
