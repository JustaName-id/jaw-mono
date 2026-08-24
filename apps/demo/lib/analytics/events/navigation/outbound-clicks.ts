import type { CtaSurface } from '../types';

/**
 * Outbound-CTA events, using the SAME destination-named convention as landing
 * (jaw.id), docs and playground so a click toward a given property has one
 * event name across every JAW app. The source app is read from the `app`
 * super-property, so "demo → playground" is
 * `PLAYGROUND_CLICKED (app=demo) → $pageview (app=playground)`.
 *
 * Destination → event name:
 *   playground → PLAYGROUND_CLICKED
 *   docs       → DOCS_CLICKED
 *   dashboard  → GET_STARTED_CLICKED
 *   jaw.id     → WEBSITE_CLICKED
 */
export const PLAYGROUND_CLICKED = 'PLAYGROUND_CLICKED';
export const DOCS_CLICKED = 'DOCS_CLICKED';
export const GET_STARTED_CLICKED = 'GET_STARTED_CLICKED';
export const WEBSITE_CLICKED = 'WEBSITE_CLICKED';

/** Shared payload: which part of the demo the CTA was clicked from. */
export interface OutboundClickPayload {
  location: CtaSurface;
}
