import { describe, it, expect, beforeEach, vi } from 'vitest';
import { EventBus } from './EventBus.js';

describe('EventBus', () => {
    let eventBus: EventBus;

    beforeEach(() => {
        eventBus = new EventBus();
    });

    describe('on/off', () => {
        it('should register a listener', () => {
            const callback = vi.fn();
            eventBus.on('authRequired', callback);

            expect(eventBus.hasListeners('authRequired')).toBe(true);
            expect(eventBus.listenerCount('authRequired')).toBe(1);
        });

        it('should register multiple listeners for the same event', () => {
            const callback1 = vi.fn();
            const callback2 = vi.fn();

            eventBus.on('authRequired', callback1);
            eventBus.on('authRequired', callback2);

            expect(eventBus.listenerCount('authRequired')).toBe(2);
        });

        it('should return an unsubscribe function', () => {
            const callback = vi.fn();
            const unsubscribe = eventBus.on('authRequired', callback);

            expect(eventBus.hasListeners('authRequired')).toBe(true);

            unsubscribe();

            expect(eventBus.hasListeners('authRequired')).toBe(false);
        });

        it('should remove a specific listener with off', () => {
            const callback1 = vi.fn();
            const callback2 = vi.fn();

            eventBus.on('authRequired', callback1);
            eventBus.on('authRequired', callback2);

            expect(eventBus.listenerCount('authRequired')).toBe(2);

            eventBus.off('authRequired', callback1);

            expect(eventBus.listenerCount('authRequired')).toBe(1);
        });

        it('should handle removing non-existent listener gracefully', () => {
            const callback = vi.fn();

            // Should not throw
            expect(() => eventBus.off('authRequired', callback)).not.toThrow();
        });
    });

    describe('emit', () => {
        it('should throw error if no listeners are registered', async () => {
            await expect(
                eventBus.emit('authRequired', {
                    method: 'eth_requestAccounts',
                    chainId: 1,
                })
            ).rejects.toThrow('No handler registered for event: authRequired');
        });

        it('should call the listener with correct data', async () => {
            const callback = vi.fn((data, resolve) => {
                resolve(['0x123']);
            });

            eventBus.on('authRequired', callback);

            const result = await eventBus.emit('authRequired', {
                method: 'eth_requestAccounts',
                chainId: 1,
            });

            expect(callback).toHaveBeenCalledTimes(1);
            expect(callback).toHaveBeenCalledWith(
                { method: 'eth_requestAccounts', chainId: 1 },
                expect.any(Function),
                expect.any(Function)
            );
            expect(result).toEqual(['0x123']);
        });

        it('should resolve with value when listener calls resolve', async () => {
            const accounts = ['0x1234567890123456789012345678901234567890'];

            eventBus.on('authRequired', (data, resolve) => {
                resolve(accounts);
            });

            const result = await eventBus.emit('authRequired', {
                method: 'eth_requestAccounts',
                chainId: 1,
            });

            expect(result).toEqual(accounts);
        });

        it('should reject with error when listener calls reject', async () => {
            const error = new Error('User rejected');

            eventBus.on('authRequired', (data, resolve, reject) => {
                reject(error);
            });

            await expect(
                eventBus.emit('authRequired', {
                    method: 'eth_requestAccounts',
                    chainId: 1,
                })
            ).rejects.toThrow('User rejected');
        });

        it('should handle async listener callbacks', async () => {
            eventBus.on('signMessage', async (data, resolve, reject) => {
                // Simulate async operation
                await new Promise(r => setTimeout(r, 10));
                resolve('0xsignature');
            });

            const result = await eventBus.emit('signMessage', {
                method: 'personal_sign',
                params: ['0xmessage', '0xaddress'],
                chainId: 1,
                account: '0xaddress',
            });

            expect(result).toBe('0xsignature');
        });

        it('should call all registered listeners', async () => {
            const callback1 = vi.fn((data, resolve) => resolve('result1'));
            const callback2 = vi.fn((data, resolve) => resolve('result2'));

            eventBus.on('authRequired', callback1);
            eventBus.on('authRequired', callback2);

            await eventBus.emit('authRequired', {
                method: 'eth_requestAccounts',
                chainId: 1,
            });

            expect(callback1).toHaveBeenCalledTimes(1);
            expect(callback2).toHaveBeenCalledTimes(1);
        });

        it('should resolve with first listener response when multiple listeners exist', async () => {
            const resolveOrder: string[] = [];

            eventBus.on('authRequired', (data, resolve) => {
                setTimeout(() => {
                    resolveOrder.push('listener1');
                    resolve('result1');
                }, 20);
            });

            eventBus.on('authRequired', (data, resolve) => {
                setTimeout(() => {
                    resolveOrder.push('listener2');
                    resolve('result2');
                }, 10);
            });

            const result = await eventBus.emit('authRequired', {
                method: 'eth_requestAccounts',
                chainId: 1,
            });

            // First to resolve wins
            expect(result).toBe('result2');
            expect(resolveOrder[0]).toBe('listener2');
        });

        it('should reject if listener throws an error', async () => {
            eventBus.on('authRequired', () => {
                throw new Error('Callback error');
            });

            await expect(
                eventBus.emit('authRequired', {
                    method: 'eth_requestAccounts',
                    chainId: 1,
                })
            ).rejects.toThrow('Callback error');
        });
    });

    describe('hasListeners', () => {
        it('should return false when no listeners are registered', () => {
            expect(eventBus.hasListeners('authRequired')).toBe(false);
        });

        it('should return true when listeners are registered', () => {
            eventBus.on('authRequired', vi.fn());
            expect(eventBus.hasListeners('authRequired')).toBe(true);
        });

        it('should return false after all listeners are removed', () => {
            const unsubscribe = eventBus.on('authRequired', vi.fn());
            expect(eventBus.hasListeners('authRequired')).toBe(true);

            unsubscribe();
            expect(eventBus.hasListeners('authRequired')).toBe(false);
        });
    });

    describe('listenerCount', () => {
        it('should return 0 when no listeners are registered', () => {
            expect(eventBus.listenerCount('authRequired')).toBe(0);
        });

        it('should return correct count of listeners', () => {
            eventBus.on('authRequired', vi.fn());
            expect(eventBus.listenerCount('authRequired')).toBe(1);

            eventBus.on('authRequired', vi.fn());
            expect(eventBus.listenerCount('authRequired')).toBe(2);

            eventBus.on('authRequired', vi.fn());
            expect(eventBus.listenerCount('authRequired')).toBe(3);
        });

        it('should return 0 for events with no listeners', () => {
            eventBus.on('authRequired', vi.fn());
            expect(eventBus.listenerCount('signMessage')).toBe(0);
        });
    });

    describe('clear', () => {
        it('should clear all listeners for a specific event', () => {
            eventBus.on('authRequired', vi.fn());
            eventBus.on('authRequired', vi.fn());
            eventBus.on('signMessage', vi.fn());

            expect(eventBus.listenerCount('authRequired')).toBe(2);
            expect(eventBus.listenerCount('signMessage')).toBe(1);

            eventBus.clear('authRequired');

            expect(eventBus.listenerCount('authRequired')).toBe(0);
            expect(eventBus.listenerCount('signMessage')).toBe(1);
        });

        it('should clear all listeners for all events when no event specified', () => {
            eventBus.on('authRequired', vi.fn());
            eventBus.on('signMessage', vi.fn());
            eventBus.on('switchChain', vi.fn());

            expect(eventBus.listenerCount('authRequired')).toBe(1);
            expect(eventBus.listenerCount('signMessage')).toBe(1);
            expect(eventBus.listenerCount('switchChain')).toBe(1);

            eventBus.clear();

            expect(eventBus.listenerCount('authRequired')).toBe(0);
            expect(eventBus.listenerCount('signMessage')).toBe(0);
            expect(eventBus.listenerCount('switchChain')).toBe(0);
        });
    });

    describe('different event types', () => {
        it('should handle authRequired events', async () => {
            const mockAccounts = ['0x123'];
            eventBus.on('authRequired', (data, resolve) => {
                expect(data.method).toBe('wallet_connect');
                expect(data.chainId).toBe(137);
                resolve(mockAccounts);
            });

            const result = await eventBus.emit('authRequired', {
                method: 'wallet_connect',
                params: [{ version: '1.0' }],
                chainId: 137,
            });

            expect(result).toEqual(mockAccounts);
        });

        it('should handle signMessage events', async () => {
            const mockSignature = '0xabcdef';
            eventBus.on('signMessage', (data, resolve) => {
                expect(data.method).toBe('personal_sign');
                expect(data.account).toBe('0x123');
                resolve(mockSignature);
            });

            const result = await eventBus.emit('signMessage', {
                method: 'personal_sign',
                params: ['0xmessage', '0x123'],
                chainId: 1,
                account: '0x123',
            });

            expect(result).toBe(mockSignature);
        });

        it('should handle signTypedData events', async () => {
            const mockSignature = '0xabcdef';
            eventBus.on('signTypedData', (data, resolve) => {
                expect(data.method).toBe('eth_signTypedData_v4');
                expect(data.account).toBe('0x123');
                resolve(mockSignature);
            });

            const result = await eventBus.emit('signTypedData', {
                method: 'eth_signTypedData_v4',
                params: ['{...typedData}', '0x123'],
                chainId: 1,
                account: '0x123',
            });

            expect(result).toBe(mockSignature);
        });

        it('should handle transactionRequest events', async () => {
            const mockTxHash = '0xtxhash';
            eventBus.on('transactionRequest', (data, resolve) => {
                expect(data.method).toBe('eth_sendTransaction');
                expect(data.account).toBe('0x123');
                resolve(mockTxHash);
            });

            const result = await eventBus.emit('transactionRequest', {
                method: 'eth_sendTransaction',
                params: [{ to: '0xabc', value: '0x0' }],
                chainId: 1,
                account: '0x123',
            });

            expect(result).toBe(mockTxHash);
        });

        it('should handle switchChain events', async () => {
            eventBus.on('switchChain', (data, resolve) => {
                expect(data.chainId).toBe(137);
                expect(data.currentChainId).toBe(1);
                resolve(null);
            });

            const result = await eventBus.emit('switchChain', {
                chainId: 137,
                currentChainId: 1,
            });

            expect(result).toBe(null);
        });

        it('should handle watchAsset events', async () => {
            eventBus.on('watchAsset', (data, resolve) => {
                expect(data.params).toBeDefined();
                resolve(true);
            });

            const result = await eventBus.emit('watchAsset', {
                params: [{ type: 'ERC20', options: { address: '0xtoken' } }],
            });

            expect(result).toBe(true);
        });
    });

    describe('type safety', () => {
        it('should enforce correct event payload types', () => {
            // This test mainly validates TypeScript compilation
            // If it compiles, the types are working correctly

            eventBus.on('authRequired', (data) => {
                // data should be typed as authRequired payload
                const method: 'eth_requestAccounts' | 'wallet_connect' = data.method;
                const chainId: number = data.chainId;
                expect(method).toBeDefined();
                expect(chainId).toBeDefined();
            });

            eventBus.on('signMessage', (data) => {
                // data should be typed as signMessage payload
                const account: string = data.account;
                expect(account).toBeDefined();
            });

            eventBus.on('signTypedData', (data) => {
                // data should be typed as signTypedData payload
                const account: string = data.account;
                expect(account).toBeDefined();
            });

            eventBus.on('switchChain', (data) => {
                // data should be typed as switchChain payload
                const chainId: number = data.chainId;
                const currentChainId: number = data.currentChainId;
                expect(chainId).toBeDefined();
                expect(currentChainId).toBeDefined();
            });
        });
    });

    describe('edge cases', () => {
        it('should handle rapid emit calls', async () => {
            let callCount = 0;
            eventBus.on('authRequired', (data, resolve) => {
                callCount++;
                resolve(`result${callCount}`);
            });

            const promises = [
                eventBus.emit('authRequired', { method: 'eth_requestAccounts', chainId: 1 }),
                eventBus.emit('authRequired', { method: 'eth_requestAccounts', chainId: 1 }),
                eventBus.emit('authRequired', { method: 'eth_requestAccounts', chainId: 1 }),
            ];

            const results = await Promise.all(promises);

            expect(results).toHaveLength(3);
            expect(callCount).toBe(3);
        });

        it('should handle listener that never resolves or rejects', async () => {
            eventBus.on('authRequired', () => {
                // Intentionally don't call resolve or reject
            });

            // This will hang forever, so we race with a timeout
            const emitPromise = eventBus.emit('authRequired', {
                method: 'eth_requestAccounts',
                chainId: 1,
            });

            const timeoutPromise = new Promise((_, reject) =>
                setTimeout(() => reject(new Error('Timeout')), 100)
            );

            await expect(Promise.race([emitPromise, timeoutPromise])).rejects.toThrow('Timeout');
        });

        it('should isolate events - listeners only receive their registered event', async () => {
            const authCallback = vi.fn((data, resolve) => resolve('auth'));
            const signCallback = vi.fn((data, resolve) => resolve('sign'));

            eventBus.on('authRequired', authCallback);
            eventBus.on('signMessage', signCallback);

            await eventBus.emit('authRequired', {
                method: 'eth_requestAccounts',
                chainId: 1,
            });

            expect(authCallback).toHaveBeenCalledTimes(1);
            expect(signCallback).not.toHaveBeenCalled();
        });
    });
});
