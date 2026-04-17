import { describe, it, expect } from 'vitest';
import { isValidKeysUrl, isValidRelayUrl, parsePermissionsConfig } from './validation.js';

describe('validation', () => {
  describe('isValidKeysUrl', () => {
    it('accepts https *.jaw.id', () => {
      expect(isValidKeysUrl('https://keys.jaw.id')).toBe(true);
      expect(isValidKeysUrl('https://staging.keys.jaw.id')).toBe(true);
    });
    it('accepts https jaw.id', () => {
      expect(isValidKeysUrl('https://jaw.id')).toBe(true);
    });
    it('accepts localhost (http)', () => {
      expect(isValidKeysUrl('http://localhost:3000')).toBe(true);
    });
    it('accepts 127.0.0.1 (http)', () => {
      expect(isValidKeysUrl('http://127.0.0.1:3000')).toBe(true);
    });
    it('rejects untrusted domain', () => {
      expect(isValidKeysUrl('https://evil.com')).toBe(false);
    });
    it('rejects http for non-localhost', () => {
      expect(isValidKeysUrl('http://keys.jaw.id')).toBe(false);
    });
    it('rejects invalid URL', () => {
      expect(isValidKeysUrl('not-a-url')).toBe(false);
    });
  });

  describe('parsePermissionsConfig', () => {
    const validAddr = '0x1234567890123456789012345678901234567890';

    it('accepts valid calls-only permissions', () => {
      const result = parsePermissionsConfig({
        calls: [{ target: validAddr, selector: '0xa9059cbb' }],
      });
      expect(result.calls).toHaveLength(1);
    });

    it('accepts valid spends-only permissions', () => {
      const result = parsePermissionsConfig({
        spends: [{ token: validAddr, allowance: '0x1000', unit: 'day' }],
      });
      expect(result.spends).toHaveLength(1);
    });

    it('accepts calls + spends together', () => {
      const result = parsePermissionsConfig({
        calls: [{ target: validAddr }],
        spends: [{ token: validAddr, allowance: '0x1000', unit: 'day', multiplier: 2 }],
      });
      expect(result.calls).toHaveLength(1);
      expect(result.spends).toHaveLength(1);
    });

    it('rejects empty object (no calls or spends)', () => {
      expect(() => parsePermissionsConfig({})).toThrow('Invalid permissions');
    });

    it('rejects empty calls array', () => {
      expect(() => parsePermissionsConfig({ calls: [] })).toThrow('Invalid permissions');
    });

    it('rejects empty spends array', () => {
      expect(() => parsePermissionsConfig({ spends: [] })).toThrow('Invalid permissions');
    });

    it('rejects invalid target address', () => {
      expect(() => parsePermissionsConfig({ calls: [{ target: 'bad' }] })).toThrow('Invalid permissions');
    });

    it('rejects invalid selector (not 4 bytes)', () => {
      expect(() => parsePermissionsConfig({ calls: [{ target: validAddr, selector: '0xaa' }] })).toThrow(
        '4-byte hex selector'
      );
    });

    it('rejects invalid spend unit', () => {
      expect(() =>
        parsePermissionsConfig({ spends: [{ token: validAddr, allowance: '0x1000', unit: 'decade' }] })
      ).toThrow('Invalid permissions');
    });

    it('rejects non-hex allowance', () => {
      expect(() =>
        parsePermissionsConfig({ spends: [{ token: validAddr, allowance: 'not-hex', unit: 'day' }] })
      ).toThrow('Invalid permissions');
    });

    it('rejects empty hex allowance (0x)', () => {
      expect(() => parsePermissionsConfig({ spends: [{ token: validAddr, allowance: '0x', unit: 'day' }] })).toThrow(
        'non-empty 0x hex value'
      );
    });

    it('rejects non-object input', () => {
      expect(() => parsePermissionsConfig('not an object')).toThrow('Invalid permissions');
    });
  });

  describe('isValidRelayUrl', () => {
    it('accepts wss *.jaw.id', () => {
      expect(isValidRelayUrl('wss://relay.jaw.id')).toBe(true);
      expect(isValidRelayUrl('wss://staging.relay.jaw.id')).toBe(true);
    });
    it('accepts ws localhost', () => {
      expect(isValidRelayUrl('ws://localhost:8080')).toBe(true);
    });
    it('accepts ws 127.0.0.1', () => {
      expect(isValidRelayUrl('ws://127.0.0.1:8080')).toBe(true);
    });
    it('rejects ws for non-localhost', () => {
      expect(isValidRelayUrl('ws://relay.jaw.id')).toBe(false);
    });
    it('rejects untrusted domain', () => {
      expect(isValidRelayUrl('wss://evil.com')).toBe(false);
    });
    it('rejects http/https scheme', () => {
      expect(isValidRelayUrl('https://relay.jaw.id')).toBe(false);
    });
    it('rejects invalid URL', () => {
      expect(isValidRelayUrl('not-a-url')).toBe(false);
    });
  });
});
