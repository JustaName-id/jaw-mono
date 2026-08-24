import {
  DOCS_CLICKED,
  GET_STARTED_CLICKED,
  OutboundClickPayload,
  PLAYGROUND_CLICKED,
  WEBSITE_CLICKED,
} from './outbound-clicks';

export const NAVIGATION_EVENTS = {
  PLAYGROUND_CLICKED,
  DOCS_CLICKED,
  GET_STARTED_CLICKED,
  WEBSITE_CLICKED,
} as const;

export interface NavigationEventPayload {
  [PLAYGROUND_CLICKED]: OutboundClickPayload;
  [DOCS_CLICKED]: OutboundClickPayload;
  [GET_STARTED_CLICKED]: OutboundClickPayload;
  [WEBSITE_CLICKED]: OutboundClickPayload;
}
