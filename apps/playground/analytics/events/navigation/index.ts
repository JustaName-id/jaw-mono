import { CODE_SNIPPET_COPIED, CodeSnippetCopiedPayload } from './code-snippet-copied';

export const NAVIGATION_EVENTS = {
  CODE_SNIPPET_COPIED,
} as const;

export interface NavigationEventPayload {
  [CODE_SNIPPET_COPIED]: CodeSnippetCopiedPayload;
}
