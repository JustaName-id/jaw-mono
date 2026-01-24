'use client'

import { Eip712Dialog, useChainIconURI } from "@jaw.id/ui";
import { usePasskeys } from "../../hooks";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { chain } from "../../lib/sdk-types";
import { getChainNameFromId } from "../../lib/chain-handlers";
import { Account, standardErrorCodes } from "@jaw.id/core";

export interface Eip712ModalProps {
  origin: string;
  typedDataJson: string;
  address?: string;
  chain: chain;
  apiKey?: string;
  onSuccess: (signature: string) => void;
  onError: (error: Error, errorCode?: number) => void;
}

// EIP-712 TypedData structure
interface TypedData {
  types: Record<string, Array<{ name: string; type: string }>>;
  primaryType: string;
  domain: Record<string, unknown>;
  message: Record<string, unknown>;
}

export const Eip712Modal = ({
  origin,
  typedDataJson,
  address,
  chain,
  apiKey,
  onSuccess,
  onError
}: Eip712ModalProps) => {
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [signatureStatus, setSignatureStatus] = useState<string>('');
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

  // Parse typed data
  const typedData = useMemo(() => {
    try {
      return JSON.parse(typedDataJson) as TypedData;
    } catch (error) {
      console.error('Failed to parse typed data:', error);
      return null;
    }
  }, [typedDataJson]);

  const signTypedData = useCallback(async () => {
    try {
      setIsProcessing(true);
      setSignatureStatus('Signing typed data...');

      if (!account) {
        throw new Error('Account not initialized. Please try again.');
      }

      if (!typedData) {
        throw new Error('Invalid typed data');
      }

      const signature = await account.signTypedData({
        domain: typedData.domain,
        types: typedData.types as any,
        primaryType: typedData.primaryType,
        message: typedData.message,
      });
      console.log('Typed Data Signature:', signature);

      setSignatureStatus('Signature created successfully!');

      // Call onSuccess immediately - parent will handle closing
      onSuccess(signature);

    } catch (error) {
      console.error("Error signing typed data:", error);
      setSignatureStatus(`Error: ${error instanceof Error ? error.message : 'Signature failed'}`);
      const errorObj = error instanceof Error ? error : new Error(String(error));
      // Check if user cancelled passkey prompt (NotAllowedError)
      const errorCode = error instanceof Error && error.name === 'NotAllowedError'
        ? standardErrorCodes.provider.userRejectedRequest
        : standardErrorCodes.rpc.internal;
      onError(errorObj, errorCode);
      setIsProcessing(false);
    }
  }, [typedData, account, onSuccess, onError]);

  const handleCancel = () => {
    if (!isProcessing) {
      setAccount(null);
      console.log('User cancelled typed data signature request');
      // User rejected request (EIP-1193 code 4001)
      onError(new Error('User rejected the request'), standardErrorCodes.provider.userRejectedRequest);
      setSignatureStatus('');
    }
  };

  useEffect(() => {
    let isMounted = true;

    const initializeModal = async () => {
      if (chain) {
        try {
          setIsProcessing(false); // Reset processing state when opening
          console.log('Initializing EIP-712 signature modal');
          console.log('Address:', address);
          console.log('Typed Data:', typedData);
          const restoredAccount = await getAccount(chain, effectiveApiKey);

          // Only update state if component is still mounted
          if (isMounted) {
            setAccount(restoredAccount);
          }
        } catch (error) {
          console.error("Error initializing account:", error);
          // Only update state if component is still mounted
          if (isMounted) {
            setSignatureStatus(`Error: ${error instanceof Error ? error.message : 'Initialization failed'}`);
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
        setSignatureStatus('');
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
  }, [typedDataJson, address, effectiveApiKey, onError, getAccount, chain, typedData]);

  const canSign = !isProcessing && !!typedDataJson && !!account && !!typedData;

  return (
    <Eip712Dialog
      open={true}
      onOpenChange={() => { console.log('onOpenChange') }}
      typedDataJson={typedDataJson}
      origin={origin}
      timestamp={timestamp}
      accountAddress={address}
      chainName={chainName}
      chainIcon={chainIcon}
      chainId={chain.id}
      onSign={signTypedData}
      onCancel={handleCancel}
      isProcessing={isProcessing}
      signatureStatus={signatureStatus}
      canSign={canSign}
    />
  );
}
