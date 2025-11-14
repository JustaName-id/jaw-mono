import { hexToNumber, numberToHex, type Address } from 'viem';
import { store } from '../store/index.js';
import type { RequestArguments } from '../provider/index.js';

/**
 * Utility function to expose capabilities for all supported chains.
 *
 * Capabilities indicate what advanced features the wallet supports (EIP-5792):
 * - atomicBatch: Execute multiple calls atomically (all succeed or all fail) - always supported
 * - atomic: Atomic transaction support status - always supported
 * - paymasterService: Support for gasless transactions via ERC-4337 paymasters (ERC-7677) - always supported
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
 * //   '0x1': { atomicBatch: { supported: true }, atomic: { status: "supported" }, paymasterService: { supported: true }, permissions: { supported: true } },
 * //   '0xaa36a7': { atomicBatch: { supported: true }, atomic: { status: "supported" }, paymasterService: { supported: true }, permissions: { supported: true } },
 * //   '0x2105': { atomicBatch: { supported: true }, atomic: { status: "supported" }, paymasterService: { supported: true }, permissions: { supported: true } },
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
            atomic: {
                status: "supported"
            },
            paymasterService: {
                supported: true,
            },
            permissions: {
                supported: true
            },
        };

        capabilities[chainIdHex] = chainCapabilities;
    }

    return capabilities;
}

/**
 * Handle wallet_getCapabilities request
 *
 * Returns the wallet's capabilities for all supported chains or filtered by chain IDs.
 * No authentication required - capabilities are static based on supported chains.
 *
 * @param request - The wallet_getCapabilities request
 * @returns Capabilities for all or filtered chains
 */
export function handleGetCapabilitiesRequest(request: RequestArguments): Record<`0x${string}`, Record<string, unknown>> {
    // EIP-5792 format: params[0] is account address (not used for static capabilities)
    // params[1] is optional array of chain IDs to filter by
    const params = request.params as [Address?, `0x${string}`[]?] | undefined;
    const filterChainIds = params?.[1];

    // Get all capabilities from store
    const state = store.getState();
    const capabilities = (state.account.capabilities ?? getCapabilities()) as Record<`0x${string}`, Record<string, unknown>>;

    // If no filter is provided, return all capabilities
    if (!filterChainIds || filterChainIds.length === 0) {
        return capabilities;
    }

    // Convert filter chain IDs to numbers once for efficient lookup
    const filterChainNumbers = new Set(filterChainIds.map((chainId) => hexToNumber(chainId)));

    // Filter capabilities by requested chain IDs
    return Object.fromEntries(
        Object.entries(capabilities).filter(([capabilityKey]) => {
            try {
                const capabilityChainNumber = hexToNumber(capabilityKey as `0x${string}`);
                return filterChainNumbers.has(capabilityChainNumber);
            } catch {
                // If capabilityKey is not a valid hex string, exclude it
                return false;
            }
        })
    ) as Record<`0x${string}`, Record<string, unknown>>;
}