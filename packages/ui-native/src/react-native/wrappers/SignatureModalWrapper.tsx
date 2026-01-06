import React, { useState, useEffect } from 'react';
import { Account } from '@jaw.id/core';
import { SignatureModal } from '../../components/SignatureModal';
import type { SignatureUIRequest, UIHandlerConfig } from '@jaw.id/core';
import { getChainNameFromId, getChainIconKeyFromId, hexToUtf8 } from '../utils';
import { useChainIcon } from '../../hooks';

interface SignatureModalWrapperProps {
  request: SignatureUIRequest;
  config: UIHandlerConfig;
  onApprove: (data: unknown) => void;
  onReject: (error?: Error) => void;
}

export const SignatureModalWrapper: React.FC<SignatureModalWrapperProps> = ({
  request,
  config,
  onApprove,
  onReject,
}) => {
  const [isSigning, setIsSigning] = useState(false);
  const [account, setAccount] = useState<Account | null>(null);
  const [accountAddress, setAccountAddress] = useState<string>('');
  const [status, setStatus] = useState<string | undefined>();

  const chainId = config.chainId || 1;
  const apiKey = config.apiKey;
  const chainName = getChainNameFromId(chainId);
  const chainIconKey = getChainIconKeyFromId(chainId);
  const chainIcon = useChainIcon(chainIconKey, 20);

  // Decode message if hex
  const rawMessage = request.data.message;
  const displayMessage = rawMessage.startsWith('0x') ? hexToUtf8(rawMessage) : rawMessage;

  // Load account on mount
  useEffect(() => {
    loadAccount();
  }, []);

  const loadAccount = async () => {
    try {
      const loadedAccount = await Account.get({ chainId, apiKey });
      setAccount(loadedAccount);
      const address = await loadedAccount.getAddress();
      setAccountAddress(address);
    } catch (error) {
      console.error('Failed to load account:', error);
      onReject(new Error('Failed to load account. Please try again.'));
    }
  };

  const handleSign = async () => {
    if (!account) return;

    setIsSigning(true);
    setStatus('Signing message...');

    try {
      const signature = await account.signMessage(rawMessage);
      onApprove(signature);
    } catch (error) {
      console.error('Failed to sign message:', error);
      if (error instanceof Error && error.name === 'NotAllowedError') {
        setStatus('Cancelled by user');
        setTimeout(() => setStatus(undefined), 2000);
        return;
      }
      setStatus('Failed to sign message');
      onReject(error instanceof Error ? error : new Error('Failed to sign message'));
    } finally {
      setIsSigning(false);
    }
  };

  const handleCancel = () => {
    onReject(new Error('User rejected the request'));
  };

  return (
    <SignatureModal
      open={true}
      onOpenChange={(open) => !open && handleCancel()}
      message={displayMessage}
      origin={request.data.origin || 'Unknown Origin'}
      timestamp={new Date()}
      accountAddress={accountAddress}
      chainName={chainName}
      chainIcon={chainIcon}
      onSign={handleSign}
      onCancel={handleCancel}
      isSigning={isSigning}
      status={status}
    />
  );
};
