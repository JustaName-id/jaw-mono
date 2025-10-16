'use client'

import { Button } from "@jaw/ui";
import { DefaultDialog } from "@jaw/ui";
// import { useSubnameCheck } from "../useSubnameCheck";
import { useIsMobile } from "../../hooks/useIsMobile";
// import { createSmartAccount } from "@/sdk/lib/justanaccount";
// import { fetchPasskeyCredential } from "@jaw.id/passkeys";
// import { useJustaName } from "@justaname.id/react";
// import { ChainId } from "@justaname.id/sdk";
import { useCallback, useEffect, useState } from "react";
import { SmartAccount } from "viem/account-abstraction";

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
  const { walletAddress } = useSubnameCheck();
  const isMobile = useIsMobile();
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [signatureStatus, setSignatureStatus] = useState<string>('');
  const { justaname } = useJustaName();
  const [message, setMessage] = useState<string>('');
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
          const message = justaname.siwe.requestChallenge({
            address: walletAddress ?? '',
            chainId: parseInt(process.env.NEXT_PUBLIC_CHAIN_ID!) as ChainId,
            domain: window.location.host,
            origin: window.location.origin,
          });
          setMessage(message.challenge);

          const passkeyCredential = fetchPasskeyCredential();
          if (!passkeyCredential) {
            throw new Error('No passkey credential found. Please log in again.');
          }

          const smartAccountInstance = await createSmartAccount(passkeyCredential, parseInt(process.env.NEXT_PUBLIC_CHAIN_ID!) as ChainId);
          setSmartAccount(smartAccountInstance);
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
  }, [open, justaname.siwe, walletAddress, onError]);

  return (
    <DefaultDialog
      open={open}
      onOpenChange={!isProcessing ? onOpenChange : undefined}
      header={
        <div className="flex flex-col gap-2.5 p-3.5">
          <p className="text-xs font-bold text-muted-foreground leading-[100%]">
            {new Date().toLocaleDateString('en-US', {
              weekday: 'long',
              day: 'numeric',
              month: 'long'
            })} at {new Date().toLocaleTimeString('en-US', {
              hour: '2-digit',
              minute: '2-digit',
              second: '2-digit',
              timeZoneName: 'short'
            })}
          </p>
          <p className="text-[30px] font-normal leading-[100%] text-foreground">
            Signature request
          </p>
          <p className="text-sm text-muted-foreground leading-[100%]">
            Review request details before you confirm
          </p>
        </div>
      }
      contentStyle={isMobile ? {
        width: '100%',
        height: '100%',
        maxWidth: 'none',
        maxHeight: 'none',
      } : {
        width: 'fit-content',
        maxWidth: '500px',
      }}
    >
      <div className="flex flex-col gap-6 justify-between max-md:h-full">
        <div className="flex flex-col gap-3">
          <div className="flex flex-col gap-2">
            <p className="text-sm font-bold text-foreground">Request from</p>
            <div className="flex flex-row items-center gap-2 p-3 border border-border rounded-[6px]">
              <div className="w-4 h-4 bg-blue-500 rounded-full flex-shrink-0"></div>
              <p className="text-sm font-normal text-foreground">{window.origin}</p>
            </div>
          </div>

          <div className="flex flex-col gap-2">
            <div className="flex flex-row items-center justify-between">
              <p className="text-sm font-bold text-foreground">Message</p>
            </div>
            <div className="p-4 bg-gray-50 rounded-[6px] min-h-[200px] max-h-[400px] overflow-y-auto">
              <p className="text-sm font-normal text-foreground whitespace-pre-wrap break-words">
                {message || 'No message provided'}
              </p>
            </div>
          </div>

          {signatureStatus && (
            <div className={`text-sm p-3 rounded-lg ${signatureStatus.includes('Error') ? 'bg-red-50 text-red-600' :
              signatureStatus.includes('successfully') ? 'bg-green-50 text-green-600' :
                'bg-blue-50 text-blue-600'
              }`}>
              {signatureStatus}
            </div>
          )}
        </div>

        <div className="flex gap-3 p-3.5 max-md:mt-auto">
          <Button
            variant="outline"
            onClick={handleCancel}
            disabled={isProcessing}
            className="flex-1"
          >
            Cancel
          </Button>
          <Button
            onClick={signMessage}
            disabled={isProcessing || !message || !smartAccount}
            className="flex-1"
          >
            {isProcessing ? 'Signing...' : 'Sign'}
          </Button>
        </div>
      </div>
    </DefaultDialog>
  )
}