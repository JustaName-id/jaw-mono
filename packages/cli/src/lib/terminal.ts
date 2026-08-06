/**
 * Make server-controlled text safe to print.
 *
 * A paid endpoint controls its response body, and parts of its 402 challenge
 * reach our refusal messages, which are then stored in the payment ledger and
 * reprinted by `jaw x402 log`. Printed raw, an escape sequence lets that server
 * erase the line the CLI just wrote and replace it with its own: a resource that
 * was never paid for can render a convincing green "Paid. 5 USDC" the CLI never
 * emitted, and once in the ledger it does so on every later read.
 *
 * Only the human renderers need this. JSON output escapes control characters on
 * its own, since JSON.stringify turns ESC into a \\u001b sequence.
 */

/**
 * C0 controls except tab and newline, DEL, and the C1 block.
 *
 * Stripping the introducers is what disarms a sequence: with no ESC and no CSI
 * the rest is inert text. Carriage return goes too, since returning to the start
 * of the line is the other half of the overwrite trick.
 */
// Matching control characters is the entire job here; the rule exists to
// catch them written by accident, which is the opposite case.
// eslint-disable-next-line no-control-regex
const CONTROL_CHARS = /[\u0000-\u0008\u000B-\u001F\u007F-\u009F]/g;

/** Left in place of a stripped byte, so tampering shows rather than vanishing. */
const REPLACEMENT = '�';

export const DEFAULT_MAX_LENGTH = 2000;

/**
 * Strip control characters and bound the length.
 *
 * Newlines survive: multi-line bodies are legitimate, and a bare newline cannot
 * move the cursor back over text already written.
 */
export function sanitizeForTerminal(value: unknown, maxLength: number = DEFAULT_MAX_LENGTH): string {
  const text = typeof value === 'string' ? value : String(value);
  const cleaned = text.replace(CONTROL_CHARS, REPLACEMENT);
  if (cleaned.length <= maxLength) return cleaned;
  // Say it was cut. A silently truncated error message reads as a complete one.
  return `${cleaned.slice(0, maxLength)}… (${cleaned.length - maxLength} more characters)`;
}
