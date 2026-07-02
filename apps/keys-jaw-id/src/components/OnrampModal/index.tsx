'use client';

import { OnrampDialog } from '@jaw.id/ui';
import { useMemo } from 'react';
import { type Chain, type OnrampOrder, type OnrampParams, standardErrorCodes } from '@jaw.id/core';
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

  const effectiveApiKey = useMemo(() => {
    // Onramp is staging-only for now (see JAW_ONRAMP_URL), which needs a staging
    // api-key — distinct from the production key the rest of the app flows in.
    // Prefer an explicit onramp key when set; fall back to the flowing key.
    // Remove this override once onramp is promoted to production.
    if (process.env.NEXT_PUBLIC_ONRAMP_API_KEY) return process.env.NEXT_PUBLIC_ONRAMP_API_KEY;
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

  if (!walletAddress) return null;

  return (
    <OnrampDialog
      apiKey={effectiveApiKey}
      destinationAddress={walletAddress}
      presets={onrampRequest?.params}
      onComplete={(order) => onSuccess?.(order)}
      onCancel={() =>
        onError?.(new Error('User rejected the request'), standardErrorCodes.provider.userRejectedRequest)
      }
      onError={(err) => onError?.(err, standardErrorCodes.rpc.internal)}
    />
  );
};
