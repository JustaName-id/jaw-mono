'use client';

import { OnrampDialog } from '@jaw.id/ui';
import { useMemo } from 'react';
import { type Chain, type OnrampOrder, type OnrampParams, standardErrorCodes, JAW_RPC_URL } from '@jaw.id/core';
import { useSessionAccount } from '../../hooks';

export interface OnrampModalProps {
  onrampRequest?: { params?: OnrampParams };
  chain?: Chain;
  apiKey?: string;
  origin?: string;
  onSuccess?: (order: OnrampOrder) => void;
  onError?: (error: Error, errorCode?: number) => void;
}

export const OnrampModal = ({ onrampRequest, chain, apiKey, origin, onSuccess, onError }: OnrampModalProps) => {
  // Onramp needs the connected smart-account address (delivery target) but no
  // signature, so we only read walletAddress from the session.
  const { walletAddress } = useSessionAccount({ origin, chain, apiKey });

  // The production api-key the rest of the app flows in (RPC/paymaster/ENS).
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

  // Onramp is staging-only for now (see JAW_ONRAMP_URL), which needs a staging
  // api-key — distinct from the production key. Prefer the explicit onramp key.
  // Remove this override once onramp is promoted to production.
  const onrampApiKey = process.env.NEXT_PUBLIC_ONRAMP_API_KEY || prodApiKey;

  // Mainnet RPC (production key) for reverse ENS resolution of the destination.
  const mainnetRpcUrl = prodApiKey ? `${JAW_RPC_URL}?chainId=1&api-key=${prodApiKey}` : `${JAW_RPC_URL}?chainId=1`;

  if (!walletAddress) return null;

  return (
    <OnrampDialog
      apiKey={onrampApiKey}
      destinationAddress={walletAddress}
      mainnetRpcUrl={mainnetRpcUrl}
      presets={onrampRequest?.params}
      onComplete={(order) => onSuccess?.(order)}
      onCancel={() =>
        onError?.(new Error('User rejected the request'), standardErrorCodes.provider.userRejectedRequest)
      }
      onError={(err) => onError?.(err, standardErrorCodes.rpc.internal)}
    />
  );
};
