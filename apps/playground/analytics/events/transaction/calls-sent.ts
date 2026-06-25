import type { ModeName, SdkType } from '../types';

export const CALLS_SENT = 'CALLS_SENT';

export interface CallsSentPayload {
  sdk: SdkType;
  mode: ModeName;
  /** Number of calls in the EIP-5792 batch. */
  count: number;
}
