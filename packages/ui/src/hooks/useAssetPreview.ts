import { useEffect, useState } from 'react';
import type { Address } from 'viem';
import type { TransactionCall } from '@jaw.id/core';
import { simulateAssetChanges, type AssetDelta } from '../utils/assetPreview';

export interface UseAssetPreviewConfig {
  /** Smart-account address the calls execute from. */
  account?: Address;
  /** Batch of calls to simulate. */
  calls: TransactionCall[];
  /** Chain ID for the simulation. */
  chainId: number;
  /** JAW API key for the RPC. */
  apiKey?: string;
  /** Gate execution (default true). */
  enabled?: boolean;
}

export interface UseAssetPreviewResult {
  assetsOut: AssetDelta[];
  assetsIn: AssetDelta[];
  loading: boolean;
  error: boolean;
}

/**
 * Simulate a batch and expose the net balance changes split into outgoing/incoming.
 * Swallows all errors into `error` so a failed/unsupported simulation never blocks signing.
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
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<boolean>(false);

  // Stable dependency key so the effect doesn't re-run on every render.
  const callsKey = calls.map((c) => `${c.to}:${c.value ?? ''}:${c.data ?? ''}`).join('|');

  useEffect(() => {
    if (!enabled || !account || calls.length === 0) {
      setAssetsOut([]);
      setAssetsIn([]);
      setLoading(false);
      setError(false);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setError(false);

    simulateAssetChanges({ chainId, apiKey, account, calls })
      .then((deltas) => {
        if (cancelled) return;
        setAssetsOut(deltas.filter((d) => d.direction === 'out'));
        setAssetsIn(deltas.filter((d) => d.direction === 'in'));
      })
      .catch(() => {
        if (cancelled) return;
        setError(true);
        setAssetsOut([]);
        setAssetsIn([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [enabled, account, chainId, apiKey, callsKey]);

  return { assetsOut, assetsIn, loading, error };
}
