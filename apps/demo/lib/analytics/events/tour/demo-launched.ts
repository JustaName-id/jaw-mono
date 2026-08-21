import type { SurfaceName } from '../types';

export const DEMO_LAUNCHED = 'DEMO_LAUNCHED';

export interface DemoLaunchedPayload {
  surface: SurfaceName;
}
