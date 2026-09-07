'use client';

import { AddFundsDialog } from '@jaw.id/ui';
import { useEffect, useMemo, useRef } from 'react';
import { isAddress } from 'viem';
import {
  type Chain,
  type NormalizedAddFundsParams,
  JAW_RPC_URL,
  MAINNET_CHAINS,
  ensureIntNumber,
  normalizeAddFundsParams,
  resolveDestination,
  standardErrorCodes,
  type Address,
} from '@jaw.id/core';
import { useAuth } from '../../hooks';

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
  /** The screen cannot be shown at all, so the dapp gets an error instead of nothing. */
  onError?: (error: Error, errorCode?: number) => void;
}

/**
 * The CrossPlatform host for `wallet_addFunds`.
 *
 * Needs the connected smart-account address to show, but no signature.
 *
 * `useAuth`, not `useSessionAccount`: that one reads the same address and then
 * restores the smart account over RPC, which this screen never uses.
 */
export const AddFundsModal = ({
  params,
  chain,
  apiKey,
  origin,
  appName,
  appLogoUrl,
  onDone,
  onError,
}: AddFundsModalProps) => {
  // `isLoading` matters: this is a react-query hook with `staleTime: 0`, so the
  // first render has no data and `walletAddress` is null before the session has
  // even been read.
  const { walletAddress, isLoading } = useAuth({ origin });

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

  // Rendering nothing would answer nobody: the flow lock stays held and the dapp
  // waits on a blank popup until the window is closed. The page's own backstop
  // for this shape is gated on CONNECT, so it does not cover us. In an effect,
  // not in the render that discovers it, because onReject posts to the SDK and
  // clears state — the same reason page.tsx does it that way.
  //
  // Two guards, both load-bearing:
  //
  // `isLoading` — without it this fires on the very first render, when the auth
  // query has no data yet, and answers -32603 for every request instead of the
  // malformed-address case it is for. It only looked safe because the page holds
  // the same query key, so the cache is usually warm by the time we mount; a
  // different `origin` string would be a fresh query and a null first render.
  //
  // `reportedRef` — `onError` is an inline arrow in RequestModals, so it has a
  // new identity on every render. Without the latch each re-render with no
  // address posts another rejection for one request.
  const reportedRef = useRef(false);
  useEffect(() => {
    if (isLoading || sessionAccount || reportedRef.current) return;
    reportedRef.current = true;
    console.error('❌ Add funds screen reached with no usable wallet address');
    onError?.(new Error('Internal error: wallet address not available'), standardErrorCodes.rpc.internal);
  }, [isLoading, sessionAccount, onError]);

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
