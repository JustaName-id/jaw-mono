/**
 * In-memory store for device code entries.
 * Short-lived (5 min TTL), suitable for single-instance deployments.
 * For production scaling, swap to Vercel KV or Redis.
 */

export interface DeviceCodeEntry {
  userCode: string;
  method: string;
  params: unknown;
  apiKey?: string;
  status: "pending" | "completed" | "error";
  result: unknown;
  submitToken: string;
  createdAt: number;
}

const MAX_STORE_SIZE = 10_000;

export const deviceCodeStore = new Map<string, DeviceCodeEntry>();

export function canAddEntry(): boolean {
  return deviceCodeStore.size < MAX_STORE_SIZE;
}
