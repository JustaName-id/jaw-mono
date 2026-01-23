'use client'

import { Eip712Dialog, useChainIcon } from "@jaw.id/ui";
import { useOriginAccount } from "../../hooks";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { chain } from "../../lib/sdk-types";
import { getChainNameFromId, getChainIconKeyFromId } from "../../lib/chain-handlers";
import { standardErrorCodes } from "@jaw.id/core";

// Error code for session errors (used by dApps to trigger re-authentication)
const SESSION_ERROR_CODE = 4901;

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
      console.log('User cancelled typed data signature request');
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

  const canSign = !isProcessing && !isAccountLoading && !!typedDataJson && !!account && !!typedData && !accountError;

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
