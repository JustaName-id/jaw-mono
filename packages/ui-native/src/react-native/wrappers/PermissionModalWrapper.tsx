import React, { useState, useEffect } from 'react';
import { Account } from '@jaw.id/core';
import { PermissionModal } from '../../components/PermissionModal';
import type { PermissionUIRequest, UIHandlerConfig } from '@jaw.id/core';
import { getChainNameFromId, getChainIconKeyFromId } from '../utils';
import { useChainIcon } from '../../hooks';
import type { SpendPermission, CallPermission } from '../../components/PermissionModal/types';
import { createPublicClient, http, formatUnits, erc20Abi } from 'viem';
import { mainnet, sepolia } from 'viem/chains';

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

// Get chain for viem client
const getChain = (chainId: number) => {
  switch (chainId) {
    case 1:
      return mainnet;
    case 11155111:
      return sepolia;
    default:
      return mainnet;
  }
};

// Fetch ERC-20 token info (decimals, symbol)
const fetchTokenInfo = async (
  tokenAddress: string,
  chainId: number
): Promise<{ decimals: number; symbol: string }> => {
  try {
    // Native token (ETH)
    if (tokenAddress === '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE') {
      return { decimals: 18, symbol: 'ETH' };
    }

    const chain = getChain(chainId);
    const client = createPublicClient({
      chain,
      transport: http(),
    });

    const [decimals, symbol] = await Promise.all([
      client.readContract({
        address: tokenAddress as `0x${string}`,
        abi: erc20Abi,
        functionName: 'decimals',
      }),
      client.readContract({
        address: tokenAddress as `0x${string}`,
        abi: erc20Abi,
        functionName: 'symbol',
      }),
    ]);

    return { decimals: Number(decimals), symbol };
  } catch (error) {
    console.error('Failed to fetch token info:', error);
    // Fallback to defaults
    return { decimals: 18, symbol: 'Token' };
  }
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

  // chainId can be number or hex string (like '0x1')
  const requestChainId = request.data.chainId;
  const chainId = typeof requestChainId === 'string'
    ? parseInt(requestChainId, requestChainId.startsWith('0x') ? 16 : 10)
    : (requestChainId || 1);
  const apiKey = config.apiKey;
  const chainName = getChainNameFromId(chainId);
  const chainIconKey = getChainIconKeyFromId(chainId);
  const chainIcon = useChainIcon(chainIconKey, 20);

  // Extract permission data from request
  const spenderAddress = request.data.spender;
  const expiry = request.data.expiry;
  const expiryDate = formatExpiryDate(expiry);
  const permissionsData = request.data.permissions;

  // Load account and parse permissions on mount
  useEffect(() => {
    const loadAccountAndParsePermissions = async () => {
      try {
        const loadedAccount = await Account.get({ chainId, apiKey });
        setAccount(loadedAccount);

        // Parse spend permissions with token info fetching
        const spendsData = permissionsData.spends || [];

        const spendsWithTokenInfo = await Promise.all(
          spendsData.map(async (spend) => {
            const tokenAddress = spend.token;
            const allowanceHex = spend.allowance;

            // Fetch token info
            const { decimals, symbol } = await fetchTokenInfo(tokenAddress, chainId);

            // Parse allowance from hex to bigint
            const allowanceBigInt = BigInt(allowanceHex);

            // Format amount with proper decimals
            const formattedAmount = formatUnits(allowanceBigInt, decimals);

            // Calculate period in seconds from unit and multiplier
            const multiplier = spend.multiplier || 1;
            const unitInSeconds = {
              'minute': 60,
              'hour': 3600,
              'day': 86400,
              'week': 604800,
              'month': 2592000,
              'year': 31536000,
              'forever': 0,
            }[spend.unit];
            const periodSeconds = spend.unit === 'forever' ? 0 : unitInSeconds * multiplier;

            // Format duration
            const duration = spend.unit === 'forever'
              ? 'Forever'
              : formatDuration(periodSeconds);

            return {
              amount: formattedAmount,
              amountUsd: undefined,
              token: symbol,
              tokenAddress,
              duration,
              limit: `${formattedAmount} ${symbol}`,
            };
          })
        );

        // Parse call permissions
        const callsData = permissionsData.calls || [];
        const calls: CallPermission[] = callsData.map((call) => ({
          target: call.target,
          selector: call.selector || '',
          functionSignature: call.functionSignature || call.selector || 'Unknown function',
        }));

        setSpendPermissions(spendsWithTokenInfo);
        setCallPermissions(calls);
      } catch (error) {
        console.error('Failed to load account:', error);
        onReject(new Error('Failed to load account. Please try again.'));
      } finally {
        setIsLoadingTokenInfo(false);
      }
    };

    loadAccountAndParsePermissions();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleConfirm = async () => {
    if (!account) return;

    setIsProcessing(true);
    setStatus('Granting permissions...');

    try {
      const result = await account.grantPermissions(
        expiry,
        spenderAddress,
        permissionsData
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

  // Generate dynamic warning message
  const totalPermissions = spendPermissions.length + callPermissions.length;
  const warningMessage = `You are granting ${totalPermissions} permission${
    totalPermissions > 1 ? 's' : ''
  } to this dApp until ${expiryDate}. Only approve if you trust this dApp.`;

  return (
    <PermissionModal
      open={true}
      onOpenChange={(open) => !open && handleCancel()}
      mode="grant"
      spenderAddress={spenderAddress}
      origin="Mobile App"
      spends={spendPermissions}
      calls={callPermissions}
      expiryDate={expiryDate}
      networkName={chainName}
      chainId={chainId}
      chainIcon={chainIcon}
      chainIconKey={chainIconKey}
      onConfirm={handleConfirm}
      onCancel={handleCancel}
      isProcessing={isProcessing}
      isLoadingTokenInfo={isLoadingTokenInfo}
      status={status}
      warningMessage={warningMessage}
    />
  );
};
