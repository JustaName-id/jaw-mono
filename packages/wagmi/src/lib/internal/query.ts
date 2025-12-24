import type { Config, Connector } from '@wagmi/core';
import type { Address } from 'viem';

// ============================================================================
// getPermissionsQueryKey
// ============================================================================

export namespace getPermissionsQueryKey {
  export type Parameters<config extends Config = Config> = {
    address?: Address;
    chainId?: number;
    connector?: Connector;
  };

  export type Value<config extends Config = Config> = readonly [
    'permissions',
    {
      address: Address | undefined;
      chainId: number | undefined;
      connectorUid: string | undefined;
    },
  ];
}

/**
 * Creates a query key for getPermissions.
 * Used by usePermissions hook and for cache invalidation.
 */
export function getPermissionsQueryKey<config extends Config>(
  parameters: getPermissionsQueryKey.Parameters<config>,
): getPermissionsQueryKey.Value<config> {
  const { address, chainId, connector } = parameters;
  return [
    'permissions',
    {
      address,
      chainId,
      connectorUid: connector?.uid,
    },
  ] as const;
}

