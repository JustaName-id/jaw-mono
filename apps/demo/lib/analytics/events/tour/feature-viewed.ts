import type { FeatureName, SurfaceName } from '../types';

export const DEMO_FEATURE_VIEWED = 'DEMO_FEATURE_VIEWED';

export interface DemoFeatureViewedPayload {
  feature: FeatureName;
  featureId: number;
  variant: string;
  surface: SurfaceName;
}
