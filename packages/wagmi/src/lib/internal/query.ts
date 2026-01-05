import type { Config, Connector } from '@wagmi/core';
import type { Address } from 'viem';
import type { AssetType, AssetFilter } from '@jaw.id/core';

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

// ============================================================================
// getAssetsQueryKey
// ============================================================================

export namespace getAssetsQueryKey {
  export type Parameters<config extends Config = Config> = {
    address?: Address;
    chainId?: number;
    connector?: Connector;
    chainFilter?: string[];
    assetTypeFilter?: AssetType[];
    assetFilter?: AssetFilter;
  };

  export type Value<config extends Config = Config> = readonly [
    'assets',
    {
      address: Address | undefined;
      chainId: number | undefined;
      connectorUid: string | undefined;
      chainFilter: string[] | undefined;
      assetTypeFilter: AssetType[] | undefined;
      assetFilter: AssetFilter | undefined;
    },
  ];
}

/**
 * Creates a query key for getAssets.
 * Used by useGetAssets hook and for cache invalidation.
 */
export function getAssetsQueryKey<config extends Config>(
  parameters: getAssetsQueryKey.Parameters<config>,
): getAssetsQueryKey.Value<config> {
  const { address, chainId, connector, chainFilter, assetTypeFilter, assetFilter } = parameters;
  return [
    'assets',
    {
      address,
      chainId,
      connectorUid: connector?.uid,
      chainFilter,
      assetTypeFilter,
      assetFilter,
    },
  ] as const;
}

