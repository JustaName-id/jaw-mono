'use client';

import { AddFundsDialog } from '@jaw.id/ui';
import { useMemo } from 'react';
import {
  type Chain,
  type OnrampOrder,
  type AddFundsParams,
  SUPPORTED_CHAINS,
  standardErrorCodes,
  JAW_RPC_URL,
} from '@jaw.id/core';
import { useSessionAccount } from '../../hooks';

export interface AddFundsModalProps {
  addFundsRequest?: { params?: AddFundsParams };
  chain?: Chain;
  apiKey?: string;
  origin?: string;
  /** The user completed a buy — resolve with the order. */
  onSuccess?: (order: OnrampOrder) => void;
  /** The user closed after receiving / without buying — resolve null (not a rejection). */
  onClose?: () => void;
  onError?: (error: Error, errorCode?: number) => void;
}

export const AddFundsModal = ({
  addFundsRequest,
  chain,
  apiKey,
  origin,
  onSuccess,
  onClose,
  onError,
}: AddFundsModalProps) => {
  // Needs the connected smart-account address (receive target / buy delivery)
  // but no signature, so we only read walletAddress from the session.
  const { walletAddress } = useSessionAccount({ origin, chain, apiKey });

  // The production api-key the rest of the app flows in (RPC/ENS).
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

  // The Buy (onramp) proxy is staging-only for now (see JAW_ONRAMP_URL), which
  // needs a staging api-key — distinct from the production key. Remove this
  // override once onramp is promoted to production.
  const onrampApiKey = process.env.NEXT_PUBLIC_ONRAMP_API_KEY || prodApiKey;

  // Mainnet RPC (production key) for reverse ENS resolution of the destination.
  const mainnetRpcUrl = prodApiKey ? `${JAW_RPC_URL}?chainId=1&api-key=${prodApiKey}` : `${JAW_RPC_URL}?chainId=1`;

  // Resolve the dApp's chains allowlist against SUPPORTED_CHAINS; unset ⇒ all.
  const chains = useMemo(() => {
    const requested = addFundsRequest?.params?.chains;
    const allowed = requested?.length ? SUPPORTED_CHAINS.filter((c) => requested.includes(c.id)) : SUPPORTED_CHAINS;
    return (allowed.length ? allowed : SUPPORTED_CHAINS).map((c) => ({ id: c.id, name: c.name }));
  }, [addFundsRequest?.params?.chains]);

  if (!walletAddress) return null;

  return (
    <AddFundsDialog
      apiKey={onrampApiKey}
      destinationAddress={walletAddress}
      mainnetRpcUrl={mainnetRpcUrl}
      chains={chains}
      defaultChainId={chain?.id}
      canBuy
      presets={addFundsRequest?.params}
      onComplete={(order) => onSuccess?.(order)}
      onCancel={() => onClose?.()}
      onError={(err) => onError?.(err, standardErrorCodes.rpc.internal)}
    />
  );
};
