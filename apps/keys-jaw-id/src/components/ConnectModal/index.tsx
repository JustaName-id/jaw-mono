'use client'

import { ConnectDialog, getChainIcon } from "@jaw/ui";
import { useMemo, useState } from "react";
import type { chain } from "../../lib/sdk-types";
import { getChainNameFromId, getChainIconKeyFromId } from "../../lib/chain-handlers";

export interface ConnectModalProps {
  origin: string;
  appName: string;
  appLogoUrl?: string;
  supportedChains?: number[];
  accountName?: string;
  walletAddress: string;
  chain?: chain;
  onSuccess: () => void;
  onError: (error: Error) => void;
}

export const ConnectModal = ({
  origin,
  appName,
  appLogoUrl,
  supportedChains,
  accountName,
  walletAddress,
  chain,
  onSuccess,
  onError
}: ConnectModalProps) => {
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [timestamp] = useState(() => new Date());

  // Get chain name and icon
  const chainName = useMemo(() => chain ? getChainNameFromId(chain.id) : undefined, [chain]);
  const chainIconKey = useMemo(() => chain ? getChainIconKeyFromId(chain.id) : undefined, [chain]);
  const chainIcon = useMemo(() => chainIconKey ? getChainIcon(chainIconKey, 16) : undefined, [chainIconKey]);

  const handleConnect = async () => {
    try {
      setIsProcessing(true);
      console.log('🔗 User approved connection to', appName);

      // Call onSuccess - parent will handle the actual connection logic
      onSuccess();
    } catch (error) {
      console.error("Error connecting:", error);
      onError(error as Error);
      setIsProcessing(false);
    }
  };

  const handleCancel = () => {
    if (!isProcessing) {
      // Create a standard user rejected error (EIP-1193 code 4001)
      const rejectionError = new Error('User rejected the request');
      (rejectionError as any).code = 4001;
      console.log('❌ User cancelled connection request');
      onError(rejectionError);
    }
  };

  return (
    <ConnectDialog
      open={true}
      onOpenChange={() => { console.log('onOpenChange') }}
      appName={appName}
      appLogoUrl={appLogoUrl}
      origin={origin}
      timestamp={timestamp}
      accountName={accountName}
      walletAddress={walletAddress}
      supportedChains={supportedChains}
      chainName={chainName}
      chainId={chain?.id}
      chainIcon={chainIcon}
      onConnect={handleConnect}
      onCancel={handleCancel}
      isProcessing={isProcessing}
    />
  );
}
