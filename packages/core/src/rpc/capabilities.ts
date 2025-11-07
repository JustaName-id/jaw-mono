import { numberToHex } from 'viem';
import { store } from '../store/index.js';

/**
 * Utility function to expose capabilities for all supported chains.
 *
 * Capabilities indicate what advanced features the wallet supports (EIP-5792):
 * - atomicBatch: Execute multiple calls atomically (all succeed or all fail) - always supported
 * - paymasterService: Support for gasless transactions via ERC-4337 paymasters (ERC-7677) - only if paymasterUrl is configured
 *
 * Reads all chains from the store (which are initialized with all supported chains on SDK creation).
 *
 * @returns Record of chain IDs (in hex) to their supported capabilities
 *
 * @example
 * ```typescript
 * const capabilities = getCapabilities();
 * // Returns:
 * // {
 * //   '0x1': { atomicBatch: { supported: true }, paymasterService: { supported: true } },
 * //   '0xaa36a7': { atomicBatch: { supported: true } },
 * //   '0x2105': { atomicBatch: { supported: true } },
 * //   // ... all supported chains
 * // }
 * ```
 */
export function getCapabilities(): Record<`0x${string}`, Record<string, unknown>> {
    const capabilities: Record<`0x${string}`, Record<string, unknown>> = {};
    const chains = store.getState().chains ?? [];

    for (const chain of chains) {
        const chainIdHex = numberToHex(chain.id) as `0x${string}`;

        const chainCapabilities: Record<string, unknown> = {
            atomicBatch: {
                supported: true,
            },
        };

        // Only include paymasterService if a paymasterUrl is configured
        if (chain.paymasterUrl) {
            chainCapabilities.paymasterService = {
                supported: true,
            };
        }

        capabilities[chainIdHex] = chainCapabilities;
    }

    return capabilities;
}