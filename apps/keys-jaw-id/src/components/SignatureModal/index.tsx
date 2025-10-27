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
  onSuccess: (signature: string, message: string) => void;
  onError: (error: Error) => void;
}

export const SignatureModal = ({
  open,
  onOpenChange,
  onSuccess,
  onError
}: SignatureModalProps) => {
  // const { walletAddress } = useSubnameCheck();
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [signatureStatus, setSignatureStatus] = useState<string>('');
  const [message, setMessage] = useState<string>('test');
  const [smartAccount, setSmartAccount] = useState<SmartAccount | null>(null);

  const signMessage = useCallback(async () => {
    try {
      setIsProcessing(true);
      setSignatureStatus('Signing message...');

      if (!smartAccount) {
        throw new Error('Smart account not initialized. Please try again.');
      }

      const signature = await smartAccount.signMessage({
        message: message
      });

      setSignatureStatus('Signature created successfully!');

      setTimeout(() => {
        onSuccess(signature, message);
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
  }, [message, smartAccount, onSuccess, onError, onOpenChange]);

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
          // const message = justaname.siwe.requestChallenge({
          //   address: walletAddress ?? '',
          //   chainId: parseInt(process.env.NEXT_PUBLIC_CHAIN_ID!) as ChainId,
          //   domain: window.location.host,
          //   origin: window.location.origin,
          // });
          setMessage(message);

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
        setMessage('');
        setSignatureStatus('');
      }
    };

    initializeModal();
    // }, [open, walletAddress, onError]);
  }, [open, onError]);

  const canSign = !isProcessing && !!message && !!smartAccount;

  return (
    <SignatureDialog
      open={open}
      onOpenChange={onOpenChange}
      message={message}
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