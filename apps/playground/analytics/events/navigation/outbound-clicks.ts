/**
 * Outbound-CTA events, using the SAME destination-named convention as the
 * landing site (jaw.id) so a click toward a given property has one event name
 * across every JAW app. The source app is read from the `app` super-property,
 * so a "→ playground" funnel is `PLAYGROUND_CLICKED → app=playground $pageview`
 * regardless of where the click originated, and can be broken down by `app`.
 *
 * Destination → event name (shared across landing/docs/playground):
 *   playground → PLAYGROUND_CLICKED
 *   docs       → DOCS_CLICKED
 *   dashboard  → GET_STARTED_CLICKED
 */
export const DOCS_CLICKED = 'DOCS_CLICKED';
export const GET_STARTED_CLICKED = 'GET_STARTED_CLICKED';

/** Shared payload: where in the app the CTA lives (e.g. `home-footer`). */
export interface OutboundClickPayload {
  location: string;
}
