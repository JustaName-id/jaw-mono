import React, { useState, useEffect } from 'react';
import { Account } from '@jaw.id/core';
import { Eip712Modal } from '../../components/SignatureModal';
import type { TypedDataUIRequest, UIHandlerConfig } from '@jaw.id/core';
import { getChainNameFromId, getChainIconKeyFromId } from '../utils';
import { useChainIcon } from '../../hooks';

interface Eip712ModalWrapperProps {
  request: TypedDataUIRequest;
  config: UIHandlerConfig;
  onApprove: (data: unknown) => void;
  onReject: (error?: Error) => void;
}

export const Eip712ModalWrapper: React.FC<Eip712ModalWrapperProps> = ({
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

  // Parse typed data
  const typedDataString = request.data.typedData;
  let parsedTypedData: any;
  try {
    parsedTypedData = typeof typedDataString === 'string'
      ? JSON.parse(typedDataString)
      : typedDataString;
  } catch {
    parsedTypedData = { error: 'Failed to parse typed data' };
  }

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
    setStatus('Signing typed data...');

    try {
      const signature = await account.signTypedData(parsedTypedData);
      onApprove(signature);
    } catch (error) {
      console.error('Failed to sign typed data:', error);
      if (error instanceof Error && error.name === 'NotAllowedError') {
        setStatus('Cancelled by user');
        setTimeout(() => setStatus(undefined), 2000);
        return;
      }
      setStatus('Failed to sign');
      onReject(error instanceof Error ? error : new Error('Failed to sign typed data'));
    } finally {
      setIsSigning(false);
    }
  };

  const handleCancel = () => {
    onReject(new Error('User rejected the request'));
  };

  // Format typed data for display
  const formattedData = JSON.stringify(parsedTypedData, null, 2);

  return (
    <Eip712Modal
      open={true}
      onOpenChange={(open) => !open && handleCancel()}
      typedData={formattedData}
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
