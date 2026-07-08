import type { SdkType } from '../types';

export const WALLET_DISCONNECTED = 'WALLET_DISCONNECTED';

export interface WalletDisconnectedPayload {
  sdk: SdkType;
}
