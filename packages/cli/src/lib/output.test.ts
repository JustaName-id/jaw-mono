import { describe, it, expect } from 'vitest';
import { formatOutput, printTable } from './output.js';

describe('output', () => {
  describe('formatOutput', () => {
    it('formats JSON output', () => {
      const result = formatOutput({ key: 'value' }, 'json');
      expect(JSON.parse(result)).toEqual({ key: 'value' });
    });

    it('handles bigint in JSON', () => {
      const result = formatOutput({ gas: BigInt(1000) }, 'json');
      expect(JSON.parse(result)).toEqual({ gas: '1000' });
    });

    it('formats human output for object', () => {
      const result = formatOutput({ name: 'test', chain: 8453 }, 'human');
      expect(result).toContain('name');
      expect(result).toContain('test');
      expect(result).toContain('8453');
    });

    it('formats human output for null', () => {
      expect(formatOutput(null, 'human')).toBe('null');
    });

    it('formats human output for empty array', () => {
      expect(formatOutput([], 'human')).toBe('(empty)');
    });
  });

  describe('printTable', () => {
    it('formats table with rows', () => {
      const result = printTable([
        { Name: 'Alice', Age: 30 },
        { Name: 'Bob', Age: 25 },
      ]);
      expect(result).toContain('Name');
      expect(result).toContain('Alice');
      expect(result).toContain('Bob');
    });

    it('returns message for empty rows', () => {
      expect(printTable([])).toBe('(no results)');
    });
  });
});
