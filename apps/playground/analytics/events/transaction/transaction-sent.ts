import type { ModeName, SdkType } from '../types';

export const TRANSACTION_SENT = 'TRANSACTION_SENT';

export interface TransactionSentPayload {
  sdk: SdkType;
  mode: ModeName;
  chainId?: number;
}
