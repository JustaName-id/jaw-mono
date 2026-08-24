import type { FeatureName } from '../types';

export const DEMO_VARIANT_SELECTED = 'DEMO_VARIANT_SELECTED';

/**
 * Fired when the visitor deliberately switches variant (happy path ↔
 * adversarial). The main reason this event exists: how many people go looking
 * for the hostile payload is the clearest read on whether the security story
 * lands.
 */
export interface DemoVariantSelectedPayload {
  feature: FeatureName;
  featureId: number;
  variant: string;
}
