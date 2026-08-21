import { DEMO_LAUNCHED, DemoLaunchedPayload } from './demo-launched';
import { DEMO_FEATURE_VIEWED, DemoFeatureViewedPayload } from './feature-viewed';
import { DEMO_VARIANT_SELECTED, DemoVariantSelectedPayload } from './variant-selected';
import { DEMO_COMPLETED, DEMO_RESTARTED, DemoFinishedPayload } from './demo-finished';

export const TOUR_EVENTS = {
  DEMO_LAUNCHED,
  DEMO_FEATURE_VIEWED,
  DEMO_VARIANT_SELECTED,
  DEMO_COMPLETED,
  DEMO_RESTARTED,
} as const;

export interface TourEventPayload {
  [DEMO_LAUNCHED]: DemoLaunchedPayload;
  [DEMO_FEATURE_VIEWED]: DemoFeatureViewedPayload;
  [DEMO_VARIANT_SELECTED]: DemoVariantSelectedPayload;
  [DEMO_COMPLETED]: DemoFinishedPayload;
  [DEMO_RESTARTED]: DemoFinishedPayload;
}
