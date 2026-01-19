import {
  type Config,
  type Connector,
  getConnectorClient,
  disconnect as wagmiDisconnect,
} from '@wagmi/core';
import type { Address, Hex } from 'viem';
import {
  type PermissionsDetail,
  type WalletGrantPermissionsResponse,
  type WalletGetPermissionsResponse,
  type RevokePermissionApiResponse,
  type WalletConnectCapabilities,
  type WalletGetAssetsResponse,
  type AssetType,
  type AssetFilter,
  type PersonalSignRequestData,
  type TypedDataRequestData,
} from '@jaw.id/core';
import type { AccountWithCapabilities } from '../Connector.js';

// ============================================================================
// connect
// ============================================================================

export namespace connect {
  export type Parameters = {
    /** The connector to use for connection */
    connector: Connector;
    /** Optional chain ID to connect to */
    chainId?: number;
    /**
     * Capabilities to request during connection.
     * When provided, uses wallet_connect instead of eth_requestAccounts.
     */
    capabilities?: WalletConnectCapabilities;
    /** Force reconnection even if already connected */
    force?: boolean;
  };

  export type ReturnType = {
    /** Connected accounts (with capabilities if requested) */
    accounts: readonly Address[] | readonly AccountWithCapabilities[];
    /** Connected chain ID */
    chainId: number;
  };

  export type ErrorType = Error;
}

/**
 * Connects to the wallet using the specified connector.
 *
 * @example
 * ```ts
 * // Basic connect
 * const result = await Actions.connect(config, {
 *   connector: jawWallet({ apiKey: 'xxx' }),
 * });
 *
 * // Connect with capabilities (subname issuance)
 * const result = await Actions.connect(config, {
 *   connector: jawWallet({ apiKey: 'xxx' }),
 *   capabilities: {
 *     subnameTextRecords: [
 *       { key: 'avatar', value: 'https://example.com/avatar.png' },
 *     ],
 *   },
 * });
 * ```
 */
export async function connect<config extends Config>(
  config: config,
  parameters: connect.Parameters,
): Promise<connect.ReturnType> {
  const { connector, chainId, capabilities } = parameters;

  const result = await connector.connect({ chainId, capabilities } as never);

  return {
    accounts: result.accounts as connect.ReturnType['accounts'],
    chainId: result.chainId,
  };
}

// ============================================================================
// grantPermissions
// ============================================================================

export namespace grantPermissions {
  export type Parameters<config extends Config = Config> = {
    address?: Address;
    chainId?: number;
    connector?: Connector;
    /** Timestamp this permission is valid until (exclusive, unix seconds) */
    expiry: number;
    /** Spender address */
    spender: Address;
    /** Permissions details */
    permissions: PermissionsDetail;
  };

  export type ReturnType = WalletGrantPermissionsResponse;
  export type ErrorType = Error;
}

/**
 * Grants permissions to a spender address.
 * This calls wallet_grantPermissions on the connected wallet.
 */
export async function grantPermissions<config extends Config>(
  config: config,
  parameters: grantPermissions.Parameters<config>,
): Promise<grantPermissions.ReturnType> {
  const { address, chainId, connector, expiry, spender, permissions } = parameters;

  const client = await getConnectorClient(config, {
    account: address,
    chainId,
    connector,
  });

  const result = await client.request({
    method: 'wallet_grantPermissions' as never,
    params: [{
      expiry,
      spender,
      permissions,
      chainId: chainId ? `0x${chainId.toString(16)}` : undefined,
    }] as never,
  });

  return result as grantPermissions.ReturnType;
}

// ============================================================================
// getPermissions
// ============================================================================

export namespace getPermissions {
  export type Parameters<config extends Config = Config> = {
    address?: Address;
    chainId?: number;
    connector?: Connector;
  };

  export type ReturnType = WalletGetPermissionsResponse;
  export type ErrorType = Error;
}

/**
 * Gets the current permissions for an address.
 * This calls wallet_getPermissions on the connected wallet.
 */
export async function getPermissions<config extends Config>(
  config: config,
  parameters: getPermissions.Parameters<config> = {},
): Promise<getPermissions.ReturnType> {
  const { address, chainId, connector } = parameters;

  const client = await getConnectorClient(config, {
    account: address,
    chainId,
    connector,
  });

  const result = await client.request({
    method: 'wallet_getPermissions' as never,
    params: [{ address }] as never,
  });

  return result as getPermissions.ReturnType;
}

// ============================================================================
// revokePermissions
// ============================================================================

export namespace revokePermissions {
  export type Parameters<config extends Config = Config> = {
    address?: Address;
    chainId?: number;
    connector?: Connector;
    /** ID of the permission to revoke (permission hash from contract) */
    id: `0x${string}`;
  };

  export type ReturnType = RevokePermissionApiResponse;
  export type ErrorType = Error;
}

/**
 * Revokes a permission by its ID.
 * This calls wallet_revokePermissions on the connected wallet.
 */
export async function revokePermissions<config extends Config>(
  config: config,
  parameters: revokePermissions.Parameters<config>,
): Promise<revokePermissions.ReturnType> {
  const { address, chainId, connector, id } = parameters;

  const client = await getConnectorClient(config, {
    account: address,
    chainId,
    connector,
  });

  const result = await client.request({
    method: 'wallet_revokePermissions' as never,
    params: [{ address, id }] as never,
  });

  return result as revokePermissions.ReturnType;
}

// ============================================================================
// disconnect
// ============================================================================

export namespace disconnect {
  export type Parameters = {
    /** Specific connector to disconnect from. If omitted, disconnects active connector. */
    connector?: Connector;
  };

  export type ReturnType = void;
  export type ErrorType = Error;
}

/**
 * Disconnects from the wallet.
 *
 * @example
 * ```ts
 * // Disconnect active connector
 * await Actions.disconnect(config);
 *
 * // Disconnect specific connector
 * await Actions.disconnect(config, { connector: jawWallet({ apiKey: 'xxx' }) });
 * ```
 */
export async function disconnect<config extends Config>(
  config: config,
  parameters: disconnect.Parameters = {},
): Promise<disconnect.ReturnType> {
  const { connector } = parameters;
  await wagmiDisconnect(config, { connector });
}

// ============================================================================
// getAssets
// ============================================================================

export namespace getAssets {
  export type Parameters<config extends Config = Config> = {
    /** Address of the account to get assets for */
    address?: Address;
    chainId?: number;
    connector?: Connector;
    /** Narrows results to specified chain IDs (hex format like "0x1") */
    chainFilter?: string[];
    /** Restricts results by asset category */
    assetTypeFilter?: AssetType[];
    /** Filters by specific assets per chain */
    assetFilter?: AssetFilter;
  };

  export type ReturnType = WalletGetAssetsResponse;
  export type ErrorType = Error;
}

/**
 * Gets the assets for an address.
 * This calls wallet_getAssets on the connected wallet.
 *
 * @example
 * ```ts
 * const assets = await Actions.getAssets(config, {
 *   chainFilter: ['0x1', '0xa'], // Mainnet and Optimism
 * });
 * ```
 */
export async function getAssets<config extends Config>(
  config: config,
  parameters: getAssets.Parameters<config> = {},
): Promise<getAssets.ReturnType> {
  const { address, chainId, connector, chainFilter, assetTypeFilter, assetFilter } = parameters;

  const client = await getConnectorClient(config, {
    account: address,
    chainId,
    connector,
  });

  const result = await client.request({
    method: 'wallet_getAssets' as never,
    params: [{
      account: address,
      chainFilter,
      assetTypeFilter,
      assetFilter,
    }] as never,
  });

  return result as getAssets.ReturnType;
}

// ============================================================================
// getCapabilities
// ============================================================================

/** Response type for wallet_getCapabilities (EIP-5792) */
export type WalletGetCapabilitiesResponse = Record<Hex, Record<string, unknown>>;

export namespace getCapabilities {
  export type Parameters<config extends Config = Config> = {
    /** Address of the account to get capabilities for (optional) */
    address?: Address;
    chainId?: number;
    connector?: Connector;
    /** Filter by specific chain IDs (hex format like "0x1") */
    chainFilter?: Hex[];
  };

  export type ReturnType = WalletGetCapabilitiesResponse;
  export type ErrorType = Error;
}

/**
 * Gets the wallet capabilities for an address.
 * This calls wallet_getCapabilities on the wallet (EIP-5792).
 * Can be called without a connected account.
 *
 * @example
 * ```ts
 * // Get capabilities for all chains
 * const capabilities = await Actions.getCapabilities(config, {});
 *
 * // Get capabilities for specific address
 * const capabilities = await Actions.getCapabilities(config, {
 *   address: '0x...',
 * });
 *
 * // Get capabilities filtered by chains
 * const capabilities = await Actions.getCapabilities(config, {
 *   chainFilter: ['0x1', '0xa'], // Mainnet and Optimism
 * });
 * ```
 */
export async function getCapabilities<config extends Config>(
  config: config,
  parameters: getCapabilities.Parameters<config> = {},
): Promise<getCapabilities.ReturnType> {
  const { address, chainId, connector, chainFilter } = parameters;

  const client = await getConnectorClient(config, {
    account: address,
    chainId,
    connector,
  });

  const result = await client.request({
    method: 'wallet_getCapabilities' as never,
    params: [address, chainFilter] as never,
  });

  return result as getCapabilities.ReturnType;
}

// ============================================================================
// sign
// ============================================================================

export namespace sign {
  export type Parameters<config extends Config = Config> = {
    address?: Address;
    chainId?: number;
    connector?: Connector;
    /** The signing request - supports personal sign (0x45) and typed data (0x01) */
    request: PersonalSignRequestData | TypedDataRequestData;
  };

  export type ReturnType = Hex;
  export type ErrorType = Error;
}

/**
 * Signs a message using the wallet_sign method (ERC-7871).
 * This is a unified signing method that combines personal_sign and eth_signTypedData_v4.
 *
 * @example
 * ```ts
 * // Personal sign (EIP-191)
 * const signature = await Actions.sign(config, {
 *   request: {
 *     type: '0x45',
 *     data: { message: 'Hello World' },
 *   },
 * });
 *
 * // Typed data sign (EIP-712)
 * const signature = await Actions.sign(config, {
 *   request: {
 *     type: '0x01',
 *     data: {
 *       types: { ... },
 *       primaryType: 'Mail',
 *       domain: { ... },
 *       message: { ... },
 *     },
 *   },
 * });
 * ```
 */
export async function sign<config extends Config>(
  config: config,
  parameters: sign.Parameters<config>,
): Promise<sign.ReturnType> {
  const { address, chainId, connector, request } = parameters;

  const client = await getConnectorClient(config, {
    account: address,
    chainId,
    connector,
  });

  const result = await client.request({
    method: 'wallet_sign' as never,
    params: [{ request }] as never,
  });

  return result as sign.ReturnType;
}

