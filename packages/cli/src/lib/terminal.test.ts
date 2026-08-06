import { describe, it, expect } from 'vitest';
import { sanitizeForTerminal, DEFAULT_MAX_LENGTH } from './terminal.js';

const ESC = String.fromCharCode(0x1b);
const CR = String.fromCharCode(0x0d);
const BEL = String.fromCharCode(0x07);

describe('sanitizeForTerminal', () => {
  // The attack this exists for: a paid endpoint erases the line the CLI wrote
  // and paints its own result in its place.
  it('disarms an erase-line-and-repaint sequence', () => {
    const attack = `eip155:9999${ESC}[2K${CR}${ESC}[32m  Paid. 5000000 USDC${ESC}[0m`;
    const safe = sanitizeForTerminal(attack);
    expect(safe).not.toContain(ESC);
    expect(safe).not.toContain(CR);
    // The text stays readable so the tampering is visible rather than silent.
    expect(safe).toContain('eip155:9999');
    expect(safe).toContain('Paid. 5000000 USDC');
  });

  it('strips the C0 block, DEL and C1, leaving a marker', () => {
    for (const ch of [ESC, CR, BEL, String.fromCharCode(0x00), String.fromCharCode(0x7f), String.fromCharCode(0x9b)]) {
      expect(sanitizeForTerminal(`a${ch}b`)).toBe('a�b');
    }
  });

  // A bare newline cannot move the cursor back over what was already written,
  // and multi-line bodies are legitimate output.
  it('keeps newlines and tabs', () => {
    expect(sanitizeForTerminal('one\ntwo\tthree')).toBe('one\ntwo\tthree');
  });

  it('leaves ordinary text alone', () => {
    expect(sanitizeForTerminal('amount 1000 exceeds maxAmountPerPayment 1')).toBe(
      'amount 1000 exceeds maxAmountPerPayment 1'
    );
  });

  it('bounds the length and says it cut', () => {
    const long = 'x'.repeat(DEFAULT_MAX_LENGTH + 500);
    const safe = sanitizeForTerminal(long);
    expect(safe.length).toBeLessThan(long.length);
    expect(safe).toContain('500 more characters');
  });

  it('takes a tighter bound for short fields', () => {
    expect(sanitizeForTerminal('y'.repeat(100), 10)).toContain('90 more characters');
  });

  it('does not annotate text that fits', () => {
    expect(sanitizeForTerminal('short', 10)).toBe('short');
  });

  it('handles non-strings without throwing', () => {
    expect(sanitizeForTerminal(undefined)).toBe('undefined');
    expect(sanitizeForTerminal(42)).toBe('42');
    expect(sanitizeForTerminal(null)).toBe('null');
  });

  it('is idempotent', () => {
    const once = sanitizeForTerminal(`a${ESC}[31mb`);
    expect(sanitizeForTerminal(once)).toBe(once);
  });
});
