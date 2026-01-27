import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { getCachedWalletConnectResponse, DEFAULT_AUTH_TTL, normalizeAuthTTL } from './SignerUtils.js';
import { store, sdkstore } from '../store/index.js';
import { SDK_VERSION } from '../sdk-info.js';

describe('SignerUtils', () => {
  beforeEach(() => {
    // Reset store state before each test
    sdkstore.setState(
      {
        chains: [],
        keys: {},
        account: {},
        config: { version: SDK_VERSION },
        callStatuses: {},
      },
      true
    );
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('normalizeAuthTTL', () => {
    it('should return DEFAULT_AUTH_TTL for undefined', () => {
      expect(normalizeAuthTTL(undefined)).toBe(DEFAULT_AUTH_TTL);
    });

    it('should return 0 for NaN', () => {
      expect(normalizeAuthTTL(NaN)).toBe(0);
    });

    it('should return 0 for negative numbers', () => {
      expect(normalizeAuthTTL(-1)).toBe(0);
      expect(normalizeAuthTTL(-100)).toBe(0);
      expect(normalizeAuthTTL(-999999)).toBe(0);
    });

    it('should return 0 for zero', () => {
      expect(normalizeAuthTTL(0)).toBe(0);
    });

    it('should return the value for positive numbers', () => {
      expect(normalizeAuthTTL(1)).toBe(1);
      expect(normalizeAuthTTL(3600)).toBe(3600);
      expect(normalizeAuthTTL(86400)).toBe(86400);
    });

    it('should return DEFAULT_AUTH_TTL for Infinity', () => {
      expect(normalizeAuthTTL(Infinity)).toBe(DEFAULT_AUTH_TTL);
    });

    it('should return DEFAULT_AUTH_TTL for -Infinity', () => {
      expect(normalizeAuthTTL(-Infinity)).toBe(DEFAULT_AUTH_TTL);
    });
  });

  describe('getCachedWalletConnectResponse', () => {
    describe('when no accounts exist', () => {
      it('should return null', async () => {
        const result = await getCachedWalletConnectResponse();
        expect(result).toBeNull();
      });
    });

    describe('when accounts exist without connectedAt timestamp', () => {
      it('should return cached response (backwards compatibility)', async () => {
        store.account.set({
          accounts: ['0x1234567890123456789012345678901234567890'],
        });

        const result = await getCachedWalletConnectResponse();

        expect(result).not.toBeNull();
        expect(result?.accounts).toHaveLength(1);
        expect(result?.accounts[0].address).toBe('0x1234567890123456789012345678901234567890');
      });
    });

    describe('authTTL validation', () => {
      it('should use DEFAULT_AUTH_TTL when authTTL is undefined', async () => {
        vi.useFakeTimers();
        const now = Date.now();
        vi.setSystemTime(now);

        store.account.set({
          accounts: ['0x1234567890123456789012345678901234567890'],
          connectedAt: now,
        });

        // Advance time to just before expiry (default is 24 hours)
        vi.setSystemTime(now + (DEFAULT_AUTH_TTL * 1000) - 1000);

        const result = await getCachedWalletConnectResponse();
        expect(result).not.toBeNull();
      });

      it('should expire after DEFAULT_AUTH_TTL when authTTL is undefined', async () => {
        vi.useFakeTimers();
        const now = Date.now();
        vi.setSystemTime(now);

        store.account.set({
          accounts: ['0x1234567890123456789012345678901234567890'],
          connectedAt: now,
        });

        // Advance time past expiry
        vi.setSystemTime(now + (DEFAULT_AUTH_TTL * 1000) + 1000);

        const result = await getCachedWalletConnectResponse();
        expect(result).toBeNull();
        // Verify account was cleared
        expect(store.account.get().accounts).toBeUndefined();
      });

      it('should respect custom positive authTTL (not expired)', async () => {
        vi.useFakeTimers();
        const now = Date.now();
        vi.setSystemTime(now);

        const customTTL = 3600; // 1 hour
        store.config.set({ authTTL: customTTL });
        store.account.set({
          accounts: ['0x1234567890123456789012345678901234567890'],
        });

        // Just before expiry - should still be valid
        vi.setSystemTime(now + (customTTL * 1000) - 1000);
        const result = await getCachedWalletConnectResponse();
        expect(result).not.toBeNull();
      });

      it('should respect custom positive authTTL (expired)', async () => {
        vi.useFakeTimers();
        const now = Date.now();
        vi.setSystemTime(now);

        const customTTL = 3600; // 1 hour
        store.config.set({ authTTL: customTTL });
        store.account.set({
          accounts: ['0x1234567890123456789012345678901234567890'],
        });

        // After expiry - should be null
        vi.setSystemTime(now + (customTTL * 1000) + 1000);
        const result = await getCachedWalletConnectResponse();
        expect(result).toBeNull();
        expect(store.account.get().accounts).toBeUndefined();
      });

      it('should expire immediately when authTTL is 0', async () => {
        vi.useFakeTimers();
        const now = Date.now();
        vi.setSystemTime(now);

        store.config.set({ authTTL: 0 });
        store.account.set({
          accounts: ['0x1234567890123456789012345678901234567890'],
          connectedAt: now,
        });

        // Even at the same instant, TTL of 0 means expired
        const result = await getCachedWalletConnectResponse();
        expect(result).toBeNull();
        expect(store.account.get().accounts).toBeUndefined();
      });

      it('should treat negative authTTL as 0 (immediate expiration)', async () => {
        vi.useFakeTimers();
        const now = Date.now();
        vi.setSystemTime(now);

        store.config.set({ authTTL: -100 });
        store.account.set({
          accounts: ['0x1234567890123456789012345678901234567890'],
          connectedAt: now,
        });

        const result = await getCachedWalletConnectResponse();
        expect(result).toBeNull();
        expect(store.account.get().accounts).toBeUndefined();
      });

      it('should treat large negative authTTL as 0 (immediate expiration)', async () => {
        vi.useFakeTimers();
        const now = Date.now();
        vi.setSystemTime(now);

        store.config.set({ authTTL: -999999 });
        store.account.set({
          accounts: ['0x1234567890123456789012345678901234567890'],
          connectedAt: now,
        });

        const result = await getCachedWalletConnectResponse();
        expect(result).toBeNull();
      });

      it('should treat NaN authTTL as 0 (immediate expiration)', async () => {
        vi.useFakeTimers();
        const now = Date.now();
        vi.setSystemTime(now);

        store.config.set({ authTTL: NaN });
        store.account.set({
          accounts: ['0x1234567890123456789012345678901234567890'],
          connectedAt: now,
        });

        const result = await getCachedWalletConnectResponse();
        expect(result).toBeNull();
        expect(store.account.get().accounts).toBeUndefined();
      });

      it('should use DEFAULT_AUTH_TTL when authTTL is Infinity', async () => {
        vi.useFakeTimers();
        const now = Date.now();
        vi.setSystemTime(now);

        store.config.set({ authTTL: Infinity });
        store.account.set({
          accounts: ['0x1234567890123456789012345678901234567890'],
          connectedAt: now,
        });

        // Advance time past DEFAULT_AUTH_TTL (24 hours)
        vi.setSystemTime(now + (DEFAULT_AUTH_TTL * 1000) + 1000);

        const result = await getCachedWalletConnectResponse();
        expect(result).toBeNull();
        expect(store.account.get().accounts).toBeUndefined();
      });
    });

    describe('connectedAt edge cases', () => {
      it('should handle connectedAt = 0 (epoch timestamp) as valid', async () => {
        vi.useFakeTimers();
        // Set current time to 1 hour after epoch
        const oneHour = 60 * 60 * 1000;
        vi.setSystemTime(oneHour);

        // Manually set connectedAt to 0 (epoch) by directly manipulating store
        sdkstore.setState((state) => ({
          ...state,
          account: {
            accounts: ['0x1234567890123456789012345678901234567890'],
            connectedAt: 0,
          },
        }));

        // With default TTL of 24 hours, session should still be valid
        const result = await getCachedWalletConnectResponse();
        expect(result).not.toBeNull();
      });

      it('should expire session with connectedAt = 0 after TTL passes', async () => {
        vi.useFakeTimers();
        // Set current time to 25 hours after epoch (past default 24h TTL)
        const twentyFiveHours = 25 * 60 * 60 * 1000;
        vi.setSystemTime(twentyFiveHours);

        // Manually set connectedAt to 0 (epoch)
        sdkstore.setState((state) => ({
          ...state,
          account: {
            accounts: ['0x1234567890123456789012345678901234567890'],
            connectedAt: 0,
          },
        }));

        const result = await getCachedWalletConnectResponse();
        expect(result).toBeNull();
      });
    });

    describe('empty accounts edge cases', () => {
      it('should return null for empty accounts array', async () => {
        sdkstore.setState((state) => ({
          ...state,
          account: {
            accounts: [],
            connectedAt: Date.now(),
          },
        }));

        const result = await getCachedWalletConnectResponse();
        expect(result).toBeNull();
      });
    });

    describe('response structure', () => {
      it('should return correct wallet connect response format', async () => {
        store.account.set({
          accounts: ['0x1234567890123456789012345678901234567890'],
          connectedAt: Date.now(),
        });

        const result = await getCachedWalletConnectResponse();

        expect(result).toEqual({
          accounts: [
            {
              address: '0x1234567890123456789012345678901234567890',
              capabilities: {},
            },
          ],
        });
      });

      it('should include capabilities for first account', async () => {
        const capabilities = {
          signInWithEthereum: { message: 'test', signature: '0x123' as `0x${string}` },
        };

        store.account.set({
          accounts: ['0x1234567890123456789012345678901234567890'],
          capabilities,
          connectedAt: Date.now(),
        });

        const result = await getCachedWalletConnectResponse();

        expect(result?.accounts[0].capabilities).toEqual(capabilities);
      });

      it('should return multiple accounts with capabilities only on first', async () => {
        const capabilities = {
          signInWithEthereum: { message: 'test', signature: '0x123' as `0x${string}` },
        };

        store.account.set({
          accounts: [
            '0x1234567890123456789012345678901234567890',
            '0xabcdefabcdefabcdefabcdefabcdefabcdefabcd',
          ],
          capabilities,
          connectedAt: Date.now(),
        });

        const result = await getCachedWalletConnectResponse();

        expect(result?.accounts).toHaveLength(2);
        expect(result?.accounts[0].capabilities).toEqual(capabilities);
        expect(result?.accounts[1].capabilities).toEqual({});
      });
    });
  });
});
