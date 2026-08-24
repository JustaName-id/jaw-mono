import { FUNDING_EVENTS, FundingEventPayload } from './funding';
import { NAVIGATION_EVENTS, NavigationEventPayload } from './navigation';
import { TOUR_EVENTS, TourEventPayload } from './tour';
import { WALLET_EVENTS, WalletEventPayload } from './wallet';

export const EVENTS = {
  ...FUNDING_EVENTS,
  ...NAVIGATION_EVENTS,
  ...TOUR_EVENTS,
  ...WALLET_EVENTS,
} as const;

export interface EventPayload
  extends FundingEventPayload,
    NavigationEventPayload,
    TourEventPayload,
    WalletEventPayload {}
