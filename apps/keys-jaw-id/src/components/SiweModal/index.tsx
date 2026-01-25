'use client'

import { SiweDialog, useChainIconURI } from "@jaw.id/ui";
import { usePasskeys, useAuth } from "../../hooks";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { chain } from "../../lib/sdk-types";
import { getChainNameFromId } from "../../lib/chain-handlers";
import { Account, standardErrorCodes, JAW_RPC_URL } from "@jaw.id/core";

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
  const { restoreAccount } = usePasskeys();
  const { credentialId, publicKey } = useAuth({ origin });
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [siweStatus, setSiweStatus] = useState<string>('');
  const [account, setAccount] = useState<Account | null>(null);
  const [timestamp] = useState(() => new Date());
  const isInitializingRef = useRef(false);

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

  // Compute mainnet RPC URL for JustaName SDK (ENS resolution)
  const mainnetRpcUrl = useMemo(() => {
    return effectiveApiKey ? `${JAW_RPC_URL}?chainId=1&api-key=${effectiveApiKey}` : `${JAW_RPC_URL}?chainId=1`;
  }, [effectiveApiKey]);

  // Get chain name and icon
  const chainName = useMemo(() => chain ? getChainNameFromId(chain.id) : undefined, [chain]);
  const chainIcon = useChainIconURI(chain?.id || 1, effectiveApiKey, 24);

  // Initialize account when modal opens
  useEffect(() => {
    const initAccount = async () => {
      if (!chain || !credentialId || !publicKey || isInitializingRef.current) return;

      isInitializingRef.current = true;
      try {
        const restored = await restoreAccount(
          { id: chain.id, rpcUrl: chain.rpcUrl, paymaster: chain.paymaster },
          credentialId,
          publicKey,
          effectiveApiKey
        );
        setAccount(restored);
      } catch (err) {
        console.error('Failed to restore account:', err);
      } finally {
        isInitializingRef.current = false;
      }
    };

    initAccount();
  }, [chain, credentialId, publicKey, restoreAccount, effectiveApiKey]);

  const signMessage = useCallback(async () => {
    try {
      setIsProcessing(true);
      setSiweStatus('Signing in...');

      if (!account) {
        throw new Error('Account not initialized. Please try again.');
      }

      const signature = await account.signMessage(messageToSign);

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
      // User rejected request (EIP-1193 code 4001)
      onError(new Error('User rejected the request'), standardErrorCodes.provider.userRejectedRequest);
      setSiweStatus('');
    }
  };

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
      mainnetRpcUrl={mainnetRpcUrl}
      onSign={signMessage}
      onCancel={handleCancel}
      isProcessing={isProcessing}
      siweStatus={siweStatus}
      canSign={canSign}
    />
  );
}
