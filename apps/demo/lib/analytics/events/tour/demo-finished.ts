import type { SurfaceName } from '../types';

/** Finale sheet reached — all four features completed. */
export const DEMO_COMPLETED = 'DEMO_COMPLETED';
/** "Run the flows again" from the finale sheet. */
export const DEMO_RESTARTED = 'DEMO_RESTARTED';

export interface DemoFinishedPayload {
  surface: SurfaceName;
}
