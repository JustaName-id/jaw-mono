'use client'

import { ConnectDialog, useChainIcon } from "@jaw/ui";
import { useMemo, useState } from "react";
import type { chain } from "../../lib/sdk-types";
import { getChainNameFromId, getChainIconKeyFromId } from "../../lib/chain-handlers";
import { standardErrorCodes } from "@jaw.id/core";



export interface ConnectModalProps {
  origin: string;
  appName: string;
  appLogoUrl?: string;
  accountName?: string;
  walletAddress: string;
  chain?: chain;
  onSuccess: () => void;
  onError: (error: Error, errorCode?: number) => void;
}

export const ConnectModal = ({
  origin,
  appName,
  appLogoUrl,
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
  const chainIcon = useChainIcon(chainIconKey || 'ethereum', 24);

  const handleConnect = async () => {
    try {
      setIsProcessing(true);
      console.log('🔗 User approved connection to', appName);
      onSuccess();
    } catch (error) {
      console.error("Error connecting:", error);
      const errorObj = error instanceof Error ? error : new Error(String(error));
      // Internal error during connection
      onError(errorObj, standardErrorCodes.rpc.internal);
      setIsProcessing(false);
    }
  };

  const handleCancel = () => {
    if (!isProcessing) {
      console.log('❌ User cancelled connection request');
      // User rejected request (EIP-1193 code 4001)
      onError(new Error('User rejected the request'), standardErrorCodes.provider.userRejectedRequest);
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
      chainName={chainName}
      chainId={chain?.id}
      chainIcon={chainIcon}
      onConnect={handleConnect}
      onCancel={handleCancel}
      isProcessing={isProcessing}
    />
  );
}
