'use client'

import { SignatureDialog, useChainIcon } from "@jaw.id/ui";
import { useOriginAccount } from "../../hooks";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { chain } from "../../lib/sdk-types";
import { getChainNameFromId, getChainIconKeyFromId } from "../../lib/chain-handlers";
import { standardErrorCodes } from "@jaw.id/core";

// Error code for session errors (used by dApps to trigger re-authentication)
const SESSION_ERROR_CODE = 4901;

export interface SignatureModalProps {
  origin: string;
  message: string;
  address?: string;
  chain: chain;
  apiKey?: string;
  onSuccess: (signature: string, message: string) => void;
  onError: (error: Error, errorCode?: number) => void;
}

export const SignatureModal = ({
  origin,
  message: messageToSign,
  address,
  chain,
  apiKey,
  onSuccess,
  onError
}: SignatureModalProps) => {
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [signatureStatus, setSignatureStatus] = useState<string>('');
  const [timestamp] = useState(() => new Date());

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

  // Get account for this origin - ensures correct account is used for multi-session
  const { account, isLoading: isAccountLoading, error: accountError } = useOriginAccount(
    origin,
    chain?.id ?? 1,
    effectiveApiKey
  );

  // Get chain name and icon
  const chainName = useMemo(() => chain ? getChainNameFromId(chain.id) : undefined, [chain]);
  const chainIconKey = useMemo(() => chain ? getChainIconKeyFromId(chain.id) : undefined, [chain]);
  const chainIcon = useChainIcon(chainIconKey || 'ethereum', 24);


  const signMessage = useCallback(async () => {
    try {
      setIsProcessing(true);
      setSignatureStatus('Signing message...');

      if (!account) {
        throw new Error('Account not initialized. Please try again.');
      }

      const signature = await account.signMessage(messageToSign);
      console.log('Signature:', signature);

      setSignatureStatus('Signature created successfully!');

      // Call onSuccess immediately - parent will handle closing
      // The parent sets state to 'success' and closes the window after onApprove completes
      onSuccess(signature, messageToSign);

    } catch (error) {
      console.error("Error signing message:", error);
      setSignatureStatus(`Error: ${error instanceof Error ? error.message : 'Signature failed'}`);
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
      console.log('User cancelled signature request');
      // User rejected request (EIP-1193 code 4001)
      onError(new Error('User rejected the request'), standardErrorCodes.provider.userRejectedRequest);
      setSignatureStatus('');
    }
  };

  // Handle session errors - reject the request so dApp can trigger re-authentication
  useEffect(() => {
    if (accountError) {
      console.error('Session error:', accountError);
      onError(new Error(`Session error: ${accountError}`), SESSION_ERROR_CODE);
    }
  }, [accountError, onError]);

  const canSign = !isProcessing && !isAccountLoading && !!messageToSign && !!account && !accountError;

  return (
    <SignatureDialog
      // open={open}
      // onOpenChange={onOpenChange}
      open={true}
      onOpenChange={() => { console.log('onOpenChange') }}
      message={messageToSign}
      origin={origin}
      timestamp={timestamp}
      accountAddress={address}
      chainName={chainName}
      chainIcon={chainIcon}
      chainId={chain.id}
      onSign={signMessage}
      onCancel={handleCancel}
      isProcessing={isProcessing}
      signatureStatus={signatureStatus}
      canSign={canSign}
    />
  );
}