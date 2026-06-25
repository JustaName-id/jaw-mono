export const CODE_SNIPPET_COPIED = 'CODE_SNIPPET_COPIED';

export interface CodeSnippetCopiedPayload {
  /** Which snippet was copied (e.g. `config`, `method`). */
  snippet: string;
  /** Where in the app the copy happened (e.g. `wagmi`, `core`). */
  location: string;
}
