'use client';

import { AddFundsDialog } from '@jaw.id/ui';
import { useMemo } from 'react';
import { isAddress } from 'viem';
import {
  type Chain,
  type NormalizedAddFundsParams,
  JAW_RPC_URL,
  MAINNET_CHAINS,
  ensureIntNumber,
  normalizeAddFundsParams,
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
 * and the chain stack is derived inside the dialog rather than passed in.
 */
export const AddFundsModal = ({ params, chain, apiKey, origin, appName, appLogoUrl, onDone }: AddFundsModalProps) => {
  const { walletAddress } = useSessionAccount({ origin, chain, apiKey });

  // Validated in the popup as well as in the SDK. The popup is reachable by
  // anything that can post to it, so it cannot assume the params already passed
  // the caller's own validation.
  const addFunds: NormalizedAddFundsParams = useMemo(() => {
    try {
      return normalizeAddFundsParams(Array.isArray(params) ? params : [params]);
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

  // MAINNET_CHAINS[0], not SUPPORTED_CHAINS[0]: the two are the same chain only
  // because SUPPORTED_CHAINS happens to list mainnets first, so reordering it
  // would silently make this fall back to a testnet. The stack shows mainnets,
  // so the code this backstops should name one too.
  const chainId = addFunds.chainId ? ensureIntNumber(addFunds.chainId) : (chain?.id ?? MAINNET_CHAINS[0]!.id);

  // The session hands back a plain string, so the shape is checked before it
  // becomes a destination: an unchecked cast would let a truncated or malformed
  // value through and render a QR code pointing at nothing. `strict: false`
  // accepts a non-checksummed address, which is a legitimate way to hold one.
  const sessionAccount = walletAddress && isAddress(walletAddress, { strict: false }) ? walletAddress : null;
  if (!sessionAccount) return null;

  return (
    <AddFundsDialog
      open
      // Still through `resolveDestination`, even with one account in hand: it is
      // the single named place a destination is decided, and phase 3 swaps it
      // for a routing address.
      address={resolveDestination([sessionAccount as Address])}
      chainId={chainId}
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
