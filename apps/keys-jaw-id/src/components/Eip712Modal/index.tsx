'use client'

import { Eip712Dialog, useChainIcon } from "@jaw/ui";
import { usePasskeys } from "../../hooks";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { chain } from "../../lib/sdk-types";
import { getChainNameFromId, getChainIconKeyFromId } from "../../lib/chain-handlers";
import {ToJustanAccountReturnType} from "@jaw.id/core";

export interface Eip712ModalProps {
  origin: string;
  typedDataJson: string;
  address?: string;
  chain: chain;
  onSuccess: (signature: string) => void;
  onError: (error: Error) => void;
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
  onSuccess,
  onError
}: Eip712ModalProps) => {
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [signatureStatus, setSignatureStatus] = useState<string>('');
  const [smartAccount, setSmartAccount] = useState<ToJustanAccountReturnType | null>(null);
  const [timestamp] = useState(() => new Date());
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);
  const { getSmartAccount } = usePasskeys();

  // Get chain name and icon
  const chainName = useMemo(() => chain ? getChainNameFromId(chain.id) : undefined, [chain]);
  const chainIconKey = useMemo(() => chain ? getChainIconKeyFromId(chain.id) : undefined, [chain]);
  const chainIcon = useChainIcon(chainIconKey || 'ethereum', 16);

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

      if (!smartAccount) {
        throw new Error('Smart account not initialized. Please try again.');
      }

      if (!typedData) {
        throw new Error('Invalid typed data');
      }

      const signature = await smartAccount.signTypedData({
        domain: typedData.domain,
        types: typedData.types,
        primaryType: typedData.primaryType,
        message: typedData.message,
      });
      console.log('🔍 Typed Data Signature:', signature);

      setSignatureStatus('Signature created successfully!');

      // Call onSuccess immediately - parent will handle closing
      onSuccess(signature);

    } catch (error) {
      console.error("Error signing typed data:", error);
      setSignatureStatus(`Error: ${error instanceof Error ? error.message : 'Signature failed'}`);
      onError(error as Error);
      setIsProcessing(false);
    }
  }, [typedData, smartAccount, onSuccess, onError]);

  const handleCancel = () => {
    if (!isProcessing) {
      setSmartAccount(null);
      // Create a standard user rejected error (EIP-1193 code 4001)
      const rejectionError = new Error('User rejected the request');
      (rejectionError as any).code = 4001;
      console.log('❌ User cancelled typed data signature request');
      onError(rejectionError);
      setSignatureStatus('');
    }
  };

  useEffect(() => {
    let isMounted = true;

    const initializeModal = async () => {
      if (chain) {
        try {
          setIsProcessing(false); // Reset processing state when opening
          console.log('🔐 Initializing EIP-712 signature modal');
          console.log('📍 Address:', address);
          console.log('📝 Typed Data:', typedData);
          const smartAccount = await getSmartAccount(chain);

          // Only update state if component is still mounted
          if (isMounted) {
            setSmartAccount(smartAccount);
          }
        } catch (error) {
          console.error("Error initializing smart account:", error);
          // Only update state if component is still mounted
          if (isMounted) {
            setSignatureStatus(`Error: ${error instanceof Error ? error.message : 'Initialization failed'}`);
            onError(error as Error);
          }
        }
      } else {
        // Reset everything when modal closes
        setSmartAccount(null);
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
  }, [typedDataJson, address, onError, getSmartAccount, chain, typedData]);

  const canSign = !isProcessing && !!typedDataJson && !!smartAccount && !!typedData;

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
