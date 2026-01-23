'use client'

import { Eip712Dialog, useChainIcon } from "@jaw.id/ui";
import { usePasskeys, useAuth } from "../../hooks";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { chain } from "../../lib/sdk-types";
import { getChainNameFromId, getChainIconKeyFromId } from "../../lib/chain-handlers";
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
  const isInitializingRef = useRef(false);
  const isMountedRef = useRef(true);
  const { restoreAccount } = usePasskeys();
  const { credentialId, publicKey } = useAuth({ origin });

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
  const chainIconKey = useMemo(() => chain ? getChainIconKeyFromId(chain.id) : undefined, [chain]);
  const chainIcon = useChainIcon(chainIconKey || 'ethereum', 24);

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
      // User rejected request (EIP-1193 code 4001)
      onError(new Error('User rejected the request'), standardErrorCodes.provider.userRejectedRequest);
      setSignatureStatus('');
    }
  };

  // Set mounted ref on mount
  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    const initializeModal = async () => {
      // Wait for chain, credentialId, and publicKey to be available
      if (!chain || !credentialId || !publicKey) {
        return;
      }

      // Skip if already initializing or initialized
      if (isInitializingRef.current || account) {
        return;
      }

      isInitializingRef.current = true;

      try {
        setIsProcessing(false); // Reset processing state when opening
        // Use restoreAccount to create Account WITHOUT triggering WebAuthn prompt
        // WebAuthn will only be triggered when user clicks Sign
        const restoredAccount = await restoreAccount(chain, credentialId, publicKey, effectiveApiKey);

        // Only update state if component is still mounted (using ref to persist across re-renders)
        if (isMountedRef.current) {
          setAccount(restoredAccount);
        }
      } catch (error) {
        console.error("Error initializing account:", error);
        // Only update state if component is still mounted
        if (isMountedRef.current) {
          setSignatureStatus(`Error: ${error instanceof Error ? error.message : 'Initialization failed'}`);
          const errorObj = error instanceof Error ? error : new Error(String(error));
          const errorCode = standardErrorCodes.rpc.internal;
          onError(errorObj, errorCode);
        }
      } finally {
        isInitializingRef.current = false;
      }
    };

    initializeModal();

    // Cleanup function - clear any pending timeouts
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }
    };
    // Note: account is checked via ref pattern to avoid re-running when it changes
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [typedDataJson, address, effectiveApiKey, credentialId, publicKey, onError, restoreAccount, chain, typedData]);

  const canSign = !isProcessing && !!typedDataJson && !!account && !!typedData;

  return (
    <Eip712Dialog
      open={true}
      onOpenChange={() => { /* Dialog always open in popup mode */ }}
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
