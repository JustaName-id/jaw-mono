'use client'

import { SignatureDialog, getChainIcon } from "@jaw/ui";
import { useAuth, usePasskeys } from "../../hooks";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { SmartAccount } from "viem/account-abstraction";
import { base, baseSepolia, optimism, optimismSepolia, arbitrum, arbitrumSepolia, mainnet, sepolia } from "viem/chains";
import type { chain } from "../../lib/sdk-types";

// Helper to get chain name from chain id
const getChainNameFromId = (chainId: number): string => {
  const chainMap: Record<number, string> = {
    [mainnet.id]: mainnet.name,
    [sepolia.id]: sepolia.name,
    [base.id]: base.name,
    [baseSepolia.id]: baseSepolia.name,
    [optimism.id]: optimism.name,
    [optimismSepolia.id]: optimismSepolia.name,
    [arbitrum.id]: arbitrum.name,
    [arbitrumSepolia.id]: arbitrumSepolia.name,
  };
  return chainMap[chainId] || `Chain ${chainId}`;
};

// Helper to get chain icon key from chain id
const getChainIconKeyFromId = (chainId: number): string => {
  const chainMap: Record<number, string> = {
    [mainnet.id]: "ethereum",
    [sepolia.id]: "sepolia",
    [base.id]: "base",
    [baseSepolia.id]: "base-sepolia",
    [optimism.id]: "optimism",
    [optimismSepolia.id]: "optimism",
    [arbitrum.id]: "arbitrum",
    [arbitrumSepolia.id]: "arbitrum",
  };
  return chainMap[chainId] || "ethereum";
};

export interface SignatureModalProps {
  origin: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  message: string;
  address?: string;
  chain: chain;
  onSuccess: (signature: string, message: string) => void;
  onError: (error: Error) => void;
}

export const SignatureModal = ({
  origin,
  open,
  onOpenChange,
  message: messageToSign,
  address,
  chain,
  onSuccess,
  onError
}: SignatureModalProps) => {
  const { walletAddress } = useAuth();
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [signatureStatus, setSignatureStatus] = useState<string>('');
  const [smartAccount, setSmartAccount] = useState<SmartAccount | null>(null);
  const [timestamp] = useState(() => new Date());
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);
  const { getSmartAccount } = usePasskeys();

  // Get chain name and icon
  const chainName = useMemo(() => chain ? getChainNameFromId(chain.id) : undefined, [chain]);
  const chainIconKey = useMemo(() => chain ? getChainIconKeyFromId(chain.id) : undefined, [chain]);
  const chainIcon = useMemo(() => chainIconKey ? getChainIcon(chainIconKey, 16) : undefined, [chainIconKey]);

  // Use walletAddress from useAuth or fallback to address prop
  const displayAddress = walletAddress || address;

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
      console.log('🔍 Signature:', signature);

      setSignatureStatus('Signature created successfully!');
      
      // Call onSuccess immediately - parent will handle closing
      // The parent sets state to 'success' and closes the window after onApprove completes
      onSuccess(signature, messageToSign);

    } catch (error) {
      console.error("Error signing message:", error);
      setSignatureStatus(`Error: ${error instanceof Error ? error.message : 'Signature failed'}`);
      onError(error as Error);
      setIsProcessing(false);
    }
  }, [messageToSign, smartAccount, onSuccess, onError, onOpenChange]);

  const handleCancel = () => {
    if (!isProcessing) {
      setSmartAccount(null);
      // Create a standard user rejected error (EIP-1193 code 4001)
      const rejectionError = new Error('User rejected the request');
      (rejectionError as any).code = 4001;
      console.log('❌ User cancelled signature request');
      onError(rejectionError);
      onOpenChange(false);
      setSignatureStatus('');
    }
  };

  useEffect(() => {
    let isMounted = true;

    const initializeModal = async () => {
      if (open) {
        try {
          setIsProcessing(false); // Reset processing state when opening
          console.log('🔐 Initializing signature modal with message:', messageToSign);
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
  }, [open, messageToSign, address, onError, getSmartAccount]);

  const canSign = !isProcessing && !!messageToSign && !!smartAccount;

  return (
    <SignatureDialog
      open={open}
      onOpenChange={onOpenChange}
      message={messageToSign}
      origin={origin}
      timestamp={timestamp}
      accountAddress={displayAddress}
      chainName={chainName}
      chainIcon={chainIcon}
      onSign={signMessage}
      onCancel={handleCancel}
      isProcessing={isProcessing}
      signatureStatus={signatureStatus}
      canSign={canSign}
    />
  );
}