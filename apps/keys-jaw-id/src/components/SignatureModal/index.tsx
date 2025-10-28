'use client'

import { SignatureDialog } from "@jaw/ui";
// import { useSubnameCheck } from "@/hooks";
import { useCallback, useEffect, useState } from "react";
import { SmartAccount } from "viem/account-abstraction";
// import { createSmartAccount, fetchPasskeyCredential } from "@jaw.id/justaname";
// import { ChainId } from "@/utils/types";

export interface SignatureModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  message: string;
  address?: string;
  onSuccess: (signature: string, message: string) => void;
  onError: (error: Error) => void;
}

export const SignatureModal = ({
  open,
  onOpenChange,
  message: messageToSign,
  address,
  onSuccess,
  onError
}: SignatureModalProps) => {
  // const { walletAddress } = useSubnameCheck();
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [signatureStatus, setSignatureStatus] = useState<string>('');
  const [smartAccount, setSmartAccount] = useState<SmartAccount | null>(null);

  const signMessage = useCallback(async () => {
    try {
      setIsProcessing(true);
      setSignatureStatus('Signing message...');

      if (!smartAccount) {
        throw new Error('Smart account not initialized. Please try again.');
      }

      const signature = await smartAccount.signMessage({
        message: messageToSign
      });

      setSignatureStatus('Signature created successfully!');

      setTimeout(() => {
        onSuccess(signature, messageToSign);
        onOpenChange(false);
        setSignatureStatus('');
        setIsProcessing(false);
      }, 1500);

    } catch (error) {
      console.error("Error signing message:", error);
      setSignatureStatus(`Error: ${error instanceof Error ? error.message : 'Signature failed'}`);
      onError(error as Error);
      setIsProcessing(false);
    }
  }, [messageToSign, smartAccount, onSuccess, onError, onOpenChange]);

  const handleCancel = () => {
    if (!isProcessing) {
      onOpenChange(false);
      setSignatureStatus('');
    }
  };

  useEffect(() => {
    const initializeModal = async () => {
      if (open) {
        try {
          console.log('🔐 Initializing signature modal with message:', messageToSign);
          console.log('📍 Address:', address);

          // TODO: Initialize smart account for signing
          // const passkeyCredential = fetchPasskeyCredential();
          // if (!passkeyCredential) {
          //   throw new Error('No passkey credential found. Please log in again.');
          // }

          // const smartAccountInstance = await createSmartAccount(passkeyCredential, parseInt(process.env.NEXT_PUBLIC_CHAIN_ID!) as ChainId);
          // setSmartAccount(smartAccountInstance);
        } catch (error) {
          console.error("Error initializing smart account:", error);
          setSignatureStatus(`Error: ${error instanceof Error ? error.message : 'Initialization failed'}`);
          onError(error as Error);
        }
      } else {
        setSmartAccount(null);
        setSignatureStatus('');
      }
    };

    initializeModal();
  }, [open, messageToSign, address, onError]);

  const canSign = !isProcessing && !!messageToSign && !!smartAccount;

  return (
    <SignatureDialog
      open={open}
      onOpenChange={onOpenChange}
      message={messageToSign}
      origin={window.location.origin}
      timestamp={new Date()}
      onSign={signMessage}
      onCancel={handleCancel}
      isProcessing={isProcessing}
      signatureStatus={signatureStatus}
      canSign={canSign}
    />
  );
}