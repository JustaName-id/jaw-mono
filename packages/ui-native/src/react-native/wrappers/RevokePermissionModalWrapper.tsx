import React, { useState, useEffect } from 'react';
import { Account } from '@jaw.id/core';
import { PermissionModal } from '../../components/PermissionModal';
import type { RevokePermissionUIRequest, UIHandlerConfig } from '@jaw.id/core';
import { getChainNameFromId, getChainIconKeyFromId } from '../utils';
import { useChainIcon } from '../../hooks';
import type { SpendPermission, CallPermission } from '../../components/PermissionModal/types';

interface RevokePermissionModalWrapperProps {
  request: RevokePermissionUIRequest;
  config: UIHandlerConfig;
  onApprove: (data: unknown) => void;
  onReject: (error?: Error) => void;
}

export const RevokePermissionModalWrapper: React.FC<RevokePermissionModalWrapperProps> = ({
  request,
  config,
  onApprove,
  onReject,
}) => {
  const [isProcessing, setIsProcessing] = useState(false);
  const [account, setAccount] = useState<Account | null>(null);
  const [status, setStatus] = useState<string | undefined>();
  const [isLoading, setIsLoading] = useState(true);
  const [spendPermissions, setSpendPermissions] = useState<SpendPermission[]>([]);
  const [callPermissions, setCallPermissions] = useState<CallPermission[]>([]);
  const [spenderAddress, setSpenderAddress] = useState<string>('');
  const [expiryDate, setExpiryDate] = useState<string>('');

  const chainId = config.chainId || 1;
  const apiKey = config.apiKey;
  const chainName = getChainNameFromId(chainId);
  const chainIconKey = getChainIconKeyFromId(chainId);
  const chainIcon = useChainIcon(chainIconKey, 20);

  const permissionId = request.data.permissionId;

  // Load account and fetch permission details on mount
  useEffect(() => {
    loadAccountAndFetchPermission();
  }, []);

  const loadAccountAndFetchPermission = async () => {
    try {
      const loadedAccount = await Account.get({ chainId, apiKey });
      setAccount(loadedAccount);

      // For now, just display the permission ID
      // In a full implementation, we'd fetch the permission details from the relay
      setSpenderAddress('Unknown');
      setExpiryDate('Unknown');
      setSpendPermissions([]);
      setCallPermissions([]);
    } catch (error) {
      console.error('Failed to load account:', error);
      onReject(new Error('Failed to load account. Please try again.'));
    } finally {
      setIsLoading(false);
    }
  };

  const handleConfirm = async () => {
    if (!account) return;

    setIsProcessing(true);
    setStatus('Revoking permission...');

    try {
      const result = await account.revokePermission(permissionId as `0x${string}`);
      onApprove(result);
    } catch (error) {
      console.error('Failed to revoke permission:', error);
      if (error instanceof Error && error.name === 'NotAllowedError') {
        setStatus('Cancelled by user');
        setTimeout(() => setStatus(undefined), 2000);
        return;
      }
      setStatus('Failed to revoke permission');
      onReject(error instanceof Error ? error : new Error('Failed to revoke permission'));
    } finally {
      setIsProcessing(false);
    }
  };

  const handleCancel = () => {
    onReject(new Error('User rejected the request'));
  };

  return (
    <PermissionModal
      open={true}
      onOpenChange={(open) => !open && handleCancel()}
      mode="revoke"
      permissionId={permissionId}
      spenderAddress={spenderAddress}
      origin={request.data.origin || 'Unknown Origin'}
      spends={spendPermissions}
      calls={callPermissions}
      expiryDate={expiryDate}
      networkName={chainName}
      chainId={chainId}
      chainIcon={chainIcon}
      onConfirm={handleConfirm}
      onCancel={handleCancel}
      isProcessing={isProcessing}
      isLoadingTokenInfo={isLoading}
      status={status}
    />
  );
};
