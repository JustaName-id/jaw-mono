'use client';

import { useEffect, useMemo, useRef } from 'react';
import {
  type Config,
  type ResolvedRegister,
  useAccount,
  useChainId,
  useConfig,
} from 'wagmi';
import {
  type UseMutationParameters,
  type UseQueryParameters,
  type UseQueryReturnType,
} from 'wagmi/query';
import {
  type UseMutationResult,
  useMutation,
  useQuery,
  useQueryClient,
  skipToken,
} from '@tanstack/react-query';
import type { EIP1193Provider } from 'viem';
import {
  connect,
  disconnect,
  grantPermissions,
  getPermissions,
  revokePermissions,
} from './core.js';
import { getPermissionsQueryKey } from './query.js';

// ============================================================================
// useConnect
// ============================================================================

export namespace useConnect {
  export type Parameters<
    config extends Config = Config,
    context = unknown,
  > = {
    config?: config;
    mutation?:
      | UseMutationParameters<
          connect.ReturnType,
          connect.ErrorType,
          connect.Parameters,
          context
        >
      | undefined;
  };

  export type ReturnType<context = unknown> = UseMutationResult<
    connect.ReturnType,
    connect.ErrorType,
    connect.Parameters,
    context
  >;
}

/**
 * Hook to connect to the wallet with optional capabilities.
 *
 * @example
 * ```tsx
 * const { mutate, data, isPending } = useConnect();
 *
 * // Basic connect
 * mutate({ connector: jawWallet({ apiKey: 'xxx' }) });
 *
 * // Connect with capabilities (subname issuance)
 * mutate({
 *   connector: jawWallet({ apiKey: 'xxx' }),
 *   capabilities: {
 *     subnameTextRecords: [
 *       { key: 'avatar', value: 'https://example.com/avatar.png' },
 *     ],
 *   },
 * });
 * ```
 */
export function useConnect<
  config extends Config = ResolvedRegister['config'],
  context = unknown,
>(
  parameters: useConnect.Parameters<config, context> = {},
): useConnect.ReturnType<context> {
  const { mutation } = parameters;
  const config = useConfig(parameters as { config?: Config });

  return useMutation({
    ...mutation,
    mutationFn: async (variables) => {
      return connect(config, variables);
    },
    mutationKey: ['connect'],
  }) as useConnect.ReturnType<context>;
}

// ============================================================================
// useGrantPermissions
// ============================================================================

export namespace useGrantPermissions {
  export type Parameters<
    config extends Config = Config,
    context = unknown,
  > = {
    config?: config;
    mutation?:
      | UseMutationParameters<
          grantPermissions.ReturnType,
          grantPermissions.ErrorType,
          grantPermissions.Parameters<config>,
          context
        >
      | undefined;
  };

  export type ReturnType<
    config extends Config = Config,
    context = unknown,
  > = UseMutationResult<
    grantPermissions.ReturnType,
    grantPermissions.ErrorType,
    grantPermissions.Parameters<config>,
    context
  >;
}

/**
 * Hook to grant permissions to a spender address.
 *
 * @example
 * ```tsx
 * const { mutate, data, isPending } = useGrantPermissions();
 *
 * mutate({
 *   expiry: Math.floor(Date.now() / 1000) + 3600, // 1 hour
 *   spender: '0x...',
 *   permissions: {
 *     calls: [{ target: '0x...', functionSignature: 'transfer(address,uint256)' }],
 *     spends: [{ token: '0x...', allowance: '1000000000000000000', unit: 'hour', multiplier: 1 }],
 *   },
 * });
 * ```
 */
export function useGrantPermissions<
  config extends Config = ResolvedRegister['config'],
  context = unknown,
>(
  parameters: useGrantPermissions.Parameters<config, context> = {},
): useGrantPermissions.ReturnType<config, context> {
  const { mutation } = parameters;
  const config = useConfig(parameters as { config?: Config });

  return useMutation({
    ...mutation,
    mutationFn: async (variables) => {
      return grantPermissions(config, variables);
    },
    mutationKey: ['grantPermissions'],
  }) as useGrantPermissions.ReturnType<config, context>;
}

// ============================================================================
// useRevokePermissions
// ============================================================================

export namespace useRevokePermissions {
  export type Parameters<
    config extends Config = Config,
    context = unknown,
  > = {
    config?: config;
    mutation?:
      | UseMutationParameters<
          revokePermissions.ReturnType,
          revokePermissions.ErrorType,
          revokePermissions.Parameters<config>,
          context
        >
      | undefined;
  };

  export type ReturnType<
    config extends Config = Config,
    context = unknown,
  > = UseMutationResult<
    revokePermissions.ReturnType,
    revokePermissions.ErrorType,
    revokePermissions.Parameters<config>,
    context
  >;
}

/**
 * Hook to revoke a permission by its ID.
 *
 * @example
 * ```tsx
 * const { mutate, isPending } = useRevokePermissions();
 *
 * mutate({
 *   id: '0x...', // permission hash
 * });
 * ```
 */
export function useRevokePermissions<
  config extends Config = ResolvedRegister['config'],
  context = unknown,
>(
  parameters: useRevokePermissions.Parameters<config, context> = {},
): useRevokePermissions.ReturnType<config, context> {
  const { mutation } = parameters;
  const config = useConfig(parameters as { config?: Config });

  return useMutation({
    ...mutation,
    mutationFn: async (variables) => {
      return revokePermissions(config, variables);
    },
    mutationKey: ['revokePermissions'],
  }) as useRevokePermissions.ReturnType<config, context>;
}

// ============================================================================
// usePermissions
// ============================================================================

export namespace usePermissions {
  export type Parameters<
    config extends Config = Config,
    selectData = getPermissions.ReturnType,
  > = getPermissions.Parameters<config> & {
    config?: config;
    query?:
      | Omit<
          UseQueryParameters<
            getPermissions.ReturnType,
            getPermissions.ErrorType,
            selectData,
            getPermissionsQueryKey.Value<config>
          >,
          'gcTime' | 'staleTime'
        >
      | undefined;
  };

  export type ReturnType<selectData = getPermissions.ReturnType> =
    UseQueryReturnType<selectData, getPermissions.ErrorType>;
}

/**
 * Hook to get the current permissions for the connected account.
 * Automatically updates when permissions change.
 *
 * @example
 * ```tsx
 * const { data: permissions, isLoading } = usePermissions();
 *
 * // With specific address
 * const { data } = usePermissions({ address: '0x...' });
 * ```
 */
export function usePermissions<
  config extends Config = ResolvedRegister['config'],
  selectData = getPermissions.ReturnType,
>(
  parameters: usePermissions.Parameters<config, selectData> = {},
): usePermissions.ReturnType<selectData> {
  const { query = {}, ...rest } = parameters;

  const config = useConfig(rest as { config?: Config });
  const queryClient = useQueryClient();
  const chainId = useChainId({ config });
  const { address, connector, status } = useAccount({ config });
  const activeConnector = parameters.connector ?? connector;

  const enabled = Boolean(
    (status === 'connected' ||
      (status === 'reconnecting' && activeConnector?.getProvider)) &&
      (query.enabled ?? true),
  );

  const queryKey = useMemo(
    () =>
      getPermissionsQueryKey({
        address,
        chainId: parameters.chainId ?? chainId,
        connector: activeConnector,
      }),
    [address, chainId, parameters.chainId, activeConnector],
  );

  // Set up event listener for permission changes
  const provider = useRef<EIP1193Provider | undefined>(undefined);
  useEffect(() => {
    if (!activeConnector) return;

    void (async () => {
      provider.current ??=
        (await activeConnector.getProvider?.()) as EIP1193Provider;

      const handleMessage = (event: { type: string }) => {
        if (event.type !== 'permissionsChanged') return;
        queryClient.invalidateQueries({ queryKey });
      };

      provider.current?.on('message', handleMessage as never);

      return () => {
        provider.current?.removeListener?.('message', handleMessage as never);
      };
    })();
  }, [address, activeConnector, queryClient, queryKey]);

  return useQuery({
    ...query,
    enabled,
    gcTime: 0,
    queryFn: activeConnector
      ? async () => {
          return getPermissions(config, {
            ...rest,
            connector: activeConnector,
          });
        }
      : skipToken,
    queryKey,
    staleTime: Number.POSITIVE_INFINITY,
  }) as usePermissions.ReturnType<selectData>;
}

// ============================================================================
// useDisconnect
// ============================================================================

export namespace useDisconnect {
  export type Parameters<
    config extends Config = Config,
    context = unknown,
  > = {
    config?: config;
    mutation?:
      | UseMutationParameters<
          disconnect.ReturnType,
          disconnect.ErrorType,
          disconnect.Parameters,
          context
        >
      | undefined;
  };

  export type ReturnType<context = unknown> = UseMutationResult<
    disconnect.ReturnType,
    disconnect.ErrorType,
    disconnect.Parameters,
    context
  >;
}

/**
 * Hook to disconnect from the wallet.
 *
 * @example
 * ```tsx
 * const { mutate: disconnectWallet, isPending } = useDisconnect();
 *
 * // Disconnect active connector
 * disconnectWallet({});
 *
 * // Disconnect specific connector
 * disconnectWallet({ connector: jawWallet({ apiKey: 'xxx' }) });
 * ```
 */
export function useDisconnect<
  config extends Config = ResolvedRegister['config'],
  context = unknown,
>(
  parameters: useDisconnect.Parameters<config, context> = {},
): useDisconnect.ReturnType<context> {
  const { mutation } = parameters;
  const config = useConfig(parameters as { config?: Config });

  return useMutation({
    ...mutation,
    mutationFn: async (variables) => {
      return disconnect(config, variables);
    },
    mutationKey: ['disconnect'],
  }) as useDisconnect.ReturnType<context>;
}

