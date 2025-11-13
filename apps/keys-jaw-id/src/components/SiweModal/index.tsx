'use client'

import { SiweDialog, useChainIcon } from "@jaw/ui";
import { usePasskeys } from "../../hooks";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { chain } from "../../lib/sdk-types";
import { getChainNameFromId, getChainIconKeyFromId } from "../../lib/chain-handlers";
import {ToJustanAccountReturnType} from "@jaw.id/core";

export interface SiweModalProps {
  origin: string;
  message: string;
  address?: string;
  chain: chain;
  appName?: string;
  appLogoUrl?: string;
  onSuccess: (signature: string, message: string) => void;
  onError: (error: Error) => void;
}

export const SiweModal = ({
  origin,
  message: messageToSign,
  address,
  chain,
  appName,
  appLogoUrl,
  onSuccess,
  onError
}: SiweModalProps) => {
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [siweStatus, setSiweStatus] = useState<string>('');
  const [smartAccount, setSmartAccount] = useState<ToJustanAccountReturnType | null>(null);
  const [timestamp] = useState(() => new Date());
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);
  const { getSmartAccount } = usePasskeys();

  // Get chain name and icon
  const chainName = useMemo(() => chain ? getChainNameFromId(chain.id) : undefined, [chain]);
  const chainIconKey = useMemo(() => chain ? getChainIconKeyFromId(chain.id) : undefined, [chain]);
  const chainIcon = useChainIcon(chainIconKey || 'ethereum', 16);

  const signMessage = useCallback(async () => {
    try {
      setIsProcessing(true);
      setSiweStatus('Signing in...');

      if (!smartAccount) {
        throw new Error('Smart account not initialized. Please try again.');
      }

      const signature = await smartAccount.signMessage({
        message: messageToSign
      });
      console.log('🔍 SIWE Signature:', signature);

      setSiweStatus('Sign in successful!');

      // Call onSuccess immediately - parent will handle closing
      onSuccess(signature, messageToSign);

    } catch (error) {
      console.error("Error signing SIWE message:", error);
      setSiweStatus(`Error: ${error instanceof Error ? error.message : 'Sign in failed'}`);
      onError(error as Error);
      setIsProcessing(false);
    }
  }, [messageToSign, smartAccount, onSuccess, onError]);

  const handleCancel = () => {
    if (!isProcessing) {
      setSmartAccount(null);
      // Create a standard user rejected error (EIP-1193 code 4001)
      const rejectionError = new Error('User rejected the request');
      (rejectionError as any).code = 4001;
      console.log('❌ User cancelled SIWE sign in request');
      onError(rejectionError);
      setSiweStatus('');
    }
  };

  useEffect(() => {
    let isMounted = true;

    const initializeModal = async () => {
      if (chain) {
        try {
          setIsProcessing(false); // Reset processing state when opening
          console.log('🔐 Initializing SIWE modal with message:', messageToSign);
          console.log('📍 Address:', address);
          const smartAccount = await getSmartAccount(chain);

          // Only update state if component is still mounted
          if (isMounted) {
            setSmartAccount(smartAccount);
          }
        } catch (error) {
          console.error("Error initializing smart account:", error);
          // Only update state if component is still mounted
          if (isMounted) {
            setSiweStatus(`Error: ${error instanceof Error ? error.message : 'Initialization failed'}`);
            onError(error as Error);
          }
        }
      } else {
        // Reset everything when modal closes
        setSmartAccount(null);
        setSiweStatus('');
        setIsProcessing(false);
      }
    };

    initializeModal();

    // Cleanup function
    return () => {
      isMounted = false;
      // Clear any pending timeouts
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }
    };
  }, [messageToSign, address, onError, getSmartAccount, chain]);

  const canSign = !isProcessing && !!messageToSign && !!smartAccount;

  return (
    <SiweDialog
      open={true}
      onOpenChange={() => { console.log('onOpenChange') }}
      message={messageToSign}
      origin={origin}
      timestamp={timestamp}
      appName={appName || 'dApp'}
      appLogoUrl={appLogoUrl}
      accountAddress={address}
      chainName={chainName}
      chainIcon={chainIcon}
      chainId={chain.id}
      onSign={signMessage}
      onCancel={handleCancel}
      isProcessing={isProcessing}
      siweStatus={siweStatus}
      canSign={canSign}
    />
  );
}
