import type { ModeName, SdkType, TransportName } from '../types';

/**
 * Same event name and payload shape playground fires, so a "connected a JAW
 * account" funnel spans both apps — the `app` super-property says which one.
 */
export const WALLET_CONNECTED = 'WALLET_CONNECTED';

export interface WalletConnectedPayload {
  sdk: SdkType;
  mode: ModeName;
  transportMode: TransportName;
  chainId?: number;
}
