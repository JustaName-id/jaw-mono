import { numberToHex } from 'viem';
import { SDKChain } from '../store/index.js';

/**
 * Utility function to expose capabilities for configured chains.
 *
 * Capabilities indicate what advanced features the wallet supports (EIP-5792):
 * - atomicBatch: Execute multiple calls atomically (all succeed or all fail) - always supported
 * - paymasterService: Support for gasless transactions via ERC-4337 paymasters (ERC-7677) - only if paymasterUrl is configured
 *
 * @param chains - Array of configured chains from the store/config
 * @returns Record of chain IDs (in hex) to their supported capabilities
 *
 * @example
 * ```typescript
 * const chains = [
 *   { id: 1, rpcUrl: '...', paymasterUrl: 'https://paymaster.example.com' },
 *   { id: 11155111, rpcUrl: '...' }
 * ];
 * const capabilities = getCapabilities(chains);
 * // Returns:
 * // {
 * //   '0x1': { atomicBatch: { status: 'supported' }, paymasterService: { supported: true } },
 * //   '0xaa36a7': { atomicBatch: { status: 'supported' } },
 * // }
 * ```
 */
export function getCapabilities(chains: SDKChain[]): Record<`0x${string}`, Record<string, unknown>> {
    const capabilities: Record<`0x${string}`, Record<string, unknown>> = {};

    for (const chain of chains) {
        const chainIdHex = numberToHex(chain.id) as `0x${string}`;

        const chainCapabilities: Record<string, unknown> = {
            atomicBatch: {
                status: 'supported',
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