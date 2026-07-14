import { useEffect, useState } from 'react';
import type { Address } from 'viem';
import type { TransactionCall } from '@jaw.id/core';
import { simulateAssetChanges, type AssetDelta } from '../utils/assetPreview';

export interface UseAssetPreviewConfig {
  account?: Address;
  calls: TransactionCall[];
  chainId: number;
  apiKey?: string;
  enabled?: boolean;
}

export interface UseAssetPreviewResult {
  assetsOut: AssetDelta[];
  assetsIn: AssetDelta[];
  error: boolean;
  /** True when the simulation ran and a call in the batch reverted — the batch would fail on-chain. */
  willRevert: boolean;
}

/**
 * Simulate a batch and split the net balance changes into outgoing/incoming.
 * Errors are swallowed into `error` so a failed/unsupported simulation never blocks signing.
 */
export function useAssetPreview({
  account,
  calls,
  chainId,
  apiKey,
  enabled = true,
}: UseAssetPreviewConfig): UseAssetPreviewResult {
  const [assetsOut, setAssetsOut] = useState<AssetDelta[]>([]);
  const [assetsIn, setAssetsIn] = useState<AssetDelta[]>([]);
  const [error, setError] = useState<boolean>(false);
  const [willRevert, setWillRevert] = useState<boolean>(false);

  // Collision-safe content key so the effect re-runs only when the batch actually changes.
  const callsKey = JSON.stringify(calls.map((c) => [c.to, c.value?.toString(), c.data]));

  useEffect(() => {
    if (!enabled || !account || calls.length === 0) {
      setAssetsOut([]);
      setAssetsIn([]);
      setError(false);
      setWillRevert(false);
      return;
    }

    let cancelled = false;
    setError(false);
    setWillRevert(false);

    simulateAssetChanges({ chainId, apiKey, account, calls })
      .then(({ deltas, willRevert }) => {
        if (cancelled) return;
        setWillRevert(willRevert);
        setAssetsOut(deltas.filter((d) => d.direction === 'out'));
        setAssetsIn(deltas.filter((d) => d.direction === 'in'));
      })
      .catch(() => {
        if (cancelled) return;
        setError(true);
        setAssetsOut([]);
        setAssetsIn([]);
        setWillRevert(false);
      });

    return () => {
      cancelled = true;
    };
  }, [enabled, account, chainId, apiKey, callsKey]);

  return { assetsOut, assetsIn, error, willRevert };
}
