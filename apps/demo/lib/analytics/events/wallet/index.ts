import { WALLET_CONNECTED, WalletConnectedPayload } from './wallet-connected';
import {
  DEMO_ACTION_COMPLETED,
  DEMO_ACTION_FAILED,
  DEMO_ACTION_REJECTED,
  DEMO_ACTION_STARTED,
  DemoActionFailedPayload,
  DemoActionPayload,
} from './wallet-action';

export const WALLET_EVENTS = {
  WALLET_CONNECTED,
  DEMO_ACTION_STARTED,
  DEMO_ACTION_COMPLETED,
  DEMO_ACTION_REJECTED,
  DEMO_ACTION_FAILED,
} as const;

export interface WalletEventPayload {
  [WALLET_CONNECTED]: WalletConnectedPayload;
  [DEMO_ACTION_STARTED]: DemoActionPayload;
  [DEMO_ACTION_COMPLETED]: DemoActionPayload;
  [DEMO_ACTION_REJECTED]: DemoActionPayload;
  [DEMO_ACTION_FAILED]: DemoActionFailedPayload;
}
