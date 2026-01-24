'use client'

import { SiweDialog, useChainIconURI } from "@jaw.id/ui";
import { usePasskeys } from "../../hooks";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { chain } from "../../lib/sdk-types";
import { getChainNameFromId } from "../../lib/chain-handlers";
import { Account, standardErrorCodes } from "@jaw.id/core";

export interface SiweModalProps {
  origin: string;
  message: string;
  address?: string;
  chain: chain;
  apiKey?: string;
  appName?: string;
  appLogoUrl?: string;
  onSuccess: (signature: string, message: string) => void;
  onError: (error: Error, errorCode?: number) => void;
}

export const SiweModal = ({
  origin,
  message: messageToSign,
  address,
  chain,
  apiKey,
  appName,
  appLogoUrl,
  onSuccess,
  onError
}: SiweModalProps) => {
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [siweStatus, setSiweStatus] = useState<string>('');
  const [account, setAccount] = useState<Account | null>(null);
  const [timestamp] = useState(() => new Date());
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);
  const { getAccount } = usePasskeys();

  // Extract API key from rpcUrl if not provided as prop
  const effectiveApiKey = useMemo(() => {
    if (apiKey) return apiKey;
    if (chain?.rpcUrl) {
      try {
        const url = new URL(chain.rpcUrl);
        return url.searchParams.get('api-key') || '';
      } catch {
        return '';
      }
    }
    return '';
  }, [apiKey, chain?.rpcUrl]);

  // Get chain name and icon
  const chainName = useMemo(() => chain ? getChainNameFromId(chain.id) : undefined, [chain]);
  const chainIcon = useChainIconURI(chain?.id || 1, effectiveApiKey, 24);

  const signMessage = useCallback(async () => {
    try {
      setIsProcessing(true);
      setSiweStatus('Signing in...');

      if (!account) {
        throw new Error('Account not initialized. Please try again.');
      }

      const signature = await account.signMessage(messageToSign);
      console.log('SIWE Signature:', signature);

      setSiweStatus('Sign in successful!');

      // Call onSuccess immediately - parent will handle closing
      onSuccess(signature, messageToSign);

    } catch (error) {
      console.error("Error signing SIWE message:", error);
      setSiweStatus(`Error: ${error instanceof Error ? error.message : 'Sign in failed'}`);
      const errorObj = error instanceof Error ? error : new Error(String(error));
      // Check if user cancelled passkey prompt (NotAllowedError)
      const errorCode = error instanceof Error && error.name === 'NotAllowedError'
        ? standardErrorCodes.provider.userRejectedRequest
        : standardErrorCodes.rpc.internal;
      onError(errorObj, errorCode);
      setIsProcessing(false);
    }
  }, [messageToSign, account, onSuccess, onError]);

  const handleCancel = () => {
    if (!isProcessing) {
      setAccount(null);
      console.log('User cancelled SIWE sign in request');
      // User rejected request (EIP-1193 code 4001)
      onError(new Error('User rejected the request'), standardErrorCodes.provider.userRejectedRequest);
      setSiweStatus('');
    }
  };

  useEffect(() => {
    let isMounted = true;

    const initializeModal = async () => {
      if (chain) {
        try {
          setIsProcessing(false); // Reset processing state when opening
          console.log('Initializing SIWE modal with message:', messageToSign);
          console.log('Address:', address);
          const restoredAccount = await getAccount(chain, effectiveApiKey);

          // Only update state if component is still mounted
          if (isMounted) {
            setAccount(restoredAccount);
          }
        } catch (error) {
          console.error("Error initializing account:", error);
          // Only update state if component is still mounted
          if (isMounted) {
            setSiweStatus(`Error: ${error instanceof Error ? error.message : 'Initialization failed'}`);
            const errorObj = error instanceof Error ? error : new Error(String(error));
            // Check if user cancelled passkey prompt (NotAllowedError)
            const errorCode = error instanceof Error && error.name === 'NotAllowedError'
              ? standardErrorCodes.provider.userRejectedRequest
              : standardErrorCodes.rpc.internal;
            onError(errorObj, errorCode);
          }
        }
      } else {
        // Reset everything when modal closes
        setAccount(null);
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
  }, [messageToSign, address, effectiveApiKey, onError, getAccount, chain]);

  const canSign = !isProcessing && !!messageToSign && !!account;

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
