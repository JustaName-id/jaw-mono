import { CODE_SNIPPET_COPIED, CodeSnippetCopiedPayload } from './code-snippet-copied';
import { DOCS_CLICKED, GET_STARTED_CLICKED, OutboundClickPayload } from './outbound-clicks';

export const NAVIGATION_EVENTS = {
  CODE_SNIPPET_COPIED,
  DOCS_CLICKED,
  GET_STARTED_CLICKED,
} as const;

export interface NavigationEventPayload {
  [CODE_SNIPPET_COPIED]: CodeSnippetCopiedPayload;
  [DOCS_CLICKED]: OutboundClickPayload;
  [GET_STARTED_CLICKED]: OutboundClickPayload;
}
