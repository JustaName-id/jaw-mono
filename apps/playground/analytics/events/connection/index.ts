import { WALLET_CONNECTED, WalletConnectedPayload } from './wallet-connected';
import { WALLET_DISCONNECTED, WalletDisconnectedPayload } from './wallet-disconnected';

export const CONNECTION_EVENTS = {
  WALLET_CONNECTED,
  WALLET_DISCONNECTED,
} as const;

export interface ConnectionEventPayload {
  [WALLET_CONNECTED]: WalletConnectedPayload;
  [WALLET_DISCONNECTED]: WalletDisconnectedPayload;
}
