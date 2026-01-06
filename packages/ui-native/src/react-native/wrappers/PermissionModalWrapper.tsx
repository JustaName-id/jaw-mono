import React, { useState, useEffect } from 'react';
import { Account } from '@jaw.id/core';
import { PermissionModal } from '../../components/PermissionModal';
import type { PermissionUIRequest, UIHandlerConfig } from '@jaw.id/core';
import { getChainNameFromId, getChainIconKeyFromId } from '../utils';
import { useChainIcon } from '../../hooks';
import type { SpendPermission, CallPermission } from '../../components/PermissionModal/types';

interface PermissionModalWrapperProps {
  request: PermissionUIRequest;
  config: UIHandlerConfig;
  onApprove: (data: unknown) => void;
  onReject: (error?: Error) => void;
}

// Format duration from seconds
const formatDuration = (seconds: number): string => {
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);

  if (days > 0) {
    return days === 1 ? '1 day' : `${days} days`;
  }
  if (hours > 0) {
    return hours === 1 ? '1 hour' : `${hours} hours`;
  }
  return `${seconds} seconds`;
};

// Format expiry date
const formatExpiryDate = (timestamp: number): string => {
  const date = new Date(timestamp * 1000);
  return date.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
};

export const PermissionModalWrapper: React.FC<PermissionModalWrapperProps> = ({
  request,
  config,
  onApprove,
  onReject,
}) => {
  const [isProcessing, setIsProcessing] = useState(false);
  const [account, setAccount] = useState<Account | null>(null);
  const [status, setStatus] = useState<string | undefined>();
  const [isLoadingTokenInfo, setIsLoadingTokenInfo] = useState(true);
  const [spendPermissions, setSpendPermissions] = useState<SpendPermission[]>([]);
  const [callPermissions, setCallPermissions] = useState<CallPermission[]>([]);

  const chainId = config.chainId || 1;
  const apiKey = config.apiKey;
  const chainName = getChainNameFromId(chainId);
  const chainIconKey = getChainIconKeyFromId(chainId);
  const chainIcon = useChainIcon(chainIconKey, 20);

  // Extract permission data from request
  const permissionData = request.data.permissions;
  const spenderAddress = permissionData.signer?.data?.id || '';
  const expiry = permissionData.expiry || 0;
  const expiryDate = formatExpiryDate(expiry);

  // Load account and parse permissions on mount
  useEffect(() => {
    loadAccountAndParsePermissions();
  }, []);

  const loadAccountAndParsePermissions = async () => {
    try {
      const loadedAccount = await Account.get({ chainId, apiKey });
      setAccount(loadedAccount);

      // Parse spend permissions
      const spends: SpendPermission[] = (permissionData.permissions || [])
        .filter((p: any) => p.type === 'native-token-recurring-allowance' || p.type === 'erc20-recurring-allowance')
        .map((p: any) => ({
          amount: p.data?.allowance || '0',
          amountUsd: undefined,
          token: p.type === 'native-token-recurring-allowance' ? 'ETH' : 'Token',
          tokenAddress: p.data?.token || '',
          duration: formatDuration(p.data?.period || 0),
          limit: p.data?.allowance || '0',
        }));

      // Parse call permissions
      const calls: CallPermission[] = (permissionData.permissions || [])
        .filter((p: any) => p.type === 'contract-call')
        .map((p: any) => ({
          target: p.data?.address || '',
          selector: p.data?.selector || '',
          functionSignature: p.data?.selector || 'Unknown function',
        }));

      setSpendPermissions(spends);
      setCallPermissions(calls);
    } catch (error) {
      console.error('Failed to load account:', error);
      onReject(new Error('Failed to load account. Please try again.'));
    } finally {
      setIsLoadingTokenInfo(false);
    }
  };

  const handleConfirm = async () => {
    if (!account) return;

    setIsProcessing(true);
    setStatus('Granting permissions...');

    try {
      const result = await account.grantPermissions(
        expiry,
        spenderAddress as `0x${string}`,
        permissionData.permissions
      );
      onApprove(result);
    } catch (error) {
      console.error('Failed to grant permissions:', error);
      if (error instanceof Error && error.name === 'NotAllowedError') {
        setStatus('Cancelled by user');
        setTimeout(() => setStatus(undefined), 2000);
        return;
      }
      setStatus('Failed to grant permissions');
      onReject(error instanceof Error ? error : new Error('Failed to grant permissions'));
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
      mode="grant"
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
      isLoadingTokenInfo={isLoadingTokenInfo}
      status={status}
    />
  );
};
