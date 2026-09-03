'use client';

import { AddFundsDialog } from '@jaw.id/ui';
import { useMemo } from 'react';
import {
  type Chain,
  type AddFundsParams,
  JAW_RPC_URL,
  SUPPORTED_CHAINS,
  parseAddFundsParams,
  resolveDestination,
  type Address,
} from '@jaw.id/core';
import { useSessionAccount } from '../../hooks';

export interface AddFundsModalProps {
  /** The dapp's raw params, validated here before anything renders. */
  params?: unknown;
  chain?: Chain;
  apiKey?: string;
  origin?: string;
  appName?: string;
  appLogoUrl?: string;
  /** The user is done. Deposits land off-app, so this resolves the request with null. */
  onDone?: () => void;
}

/**
 * The CrossPlatform host for `wallet_addFunds`.
 *
 * Needs the connected smart-account address to show, but no signature, so it
 * only reads `walletAddress` off the session. Nothing here can be supplied by
 * the dapp: the destination comes from the session through `resolveDestination`,
 * and the chains come from what this popup was told the app supports.
 */
export const AddFundsModal = ({ params, chain, apiKey, origin, appName, appLogoUrl, onDone }: AddFundsModalProps) => {
  const { walletAddress } = useSessionAccount({ origin, chain, apiKey });

  // Validated in the popup as well as in the SDK. The popup is reachable by
  // anything that can post to it, so it cannot assume the params already passed
  // the caller's own validation.
  const addFunds: AddFundsParams = useMemo(() => {
    try {
      return parseAddFundsParams(Array.isArray(params) ? params : [params]);
    } catch {
      // A malformed hint is not worth refusing the screen over — the address is
      // still correct and still the thing the user came for.
      return {};
    }
  }, [params]);

  const prodApiKey = useMemo(() => {
    if (apiKey) return apiKey;
    if (chain?.rpcUrl) {
      try {
        return new URL(chain.rpcUrl).searchParams.get('api-key') || '';
      } catch {
        return '';
      }
    }
    return '';
  }, [apiKey, chain?.rpcUrl]);

  const mainnetRpcUrl = prodApiKey ? `${JAW_RPC_URL}?chainId=1&api-key=${prodApiKey}` : `${JAW_RPC_URL}?chainId=1`;

  const chainId = addFunds.chainId ?? chain?.id ?? SUPPORTED_CHAINS[0]!.id;

  if (!walletAddress) return null;

  return (
    <AddFundsDialog
      open
      address={resolveDestination([walletAddress as Address])}
      chainId={chainId}
      asset={addFunds.asset}
      mainnetRpcUrl={mainnetRpcUrl}
      apiKey={prodApiKey}
      origin={origin}
      appName={appName}
      appLogoUrl={appLogoUrl}
      onDone={() => onDone?.()}
      onOpenChange={(next) => {
        if (!next) onDone?.();
      }}
    />
  );
};
