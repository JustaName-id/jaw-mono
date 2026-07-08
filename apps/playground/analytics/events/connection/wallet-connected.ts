import type { ModeName, SdkType, TransportName } from '../types';

export const WALLET_CONNECTED = 'WALLET_CONNECTED';

export interface WalletConnectedPayload {
  sdk: SdkType;
  mode: ModeName;
  transportMode: TransportName;
  chainId?: number;
}
