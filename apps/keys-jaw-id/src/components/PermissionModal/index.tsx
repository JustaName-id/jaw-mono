'use client'

import { PermissionDialog } from "@jaw/ui";
import { useCallback, useEffect, useMemo, useState } from "react";
import { formatUnits, erc20Abi, createPublicClient, http, type Address } from "viem";
import { getChainNameFromId, getChainIconKeyFromId } from "../../lib/chain-handlers";
import { usePasskeys } from "../../hooks";
import {
    grantPermissions,
    revokePermission,
    type Chain,
    ToJustanAccountReturnType,
    type WalletGrantPermissionsRequest,
    type WalletRevokePermissionsRequest,
    type WalletGrantPermissionsResponse,
    type SpendPeriod, getPermissionFromRelay,
} from "@jaw.id/core";

// ERC-7528 native token address
const NATIVE_TOKEN = '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE';

// Check if token is native
const isNativeToken = (tokenAddress?: string): boolean => {
  if (!tokenAddress) return true;
  return tokenAddress.toLowerCase() === NATIVE_TOKEN.toLowerCase();
};

// Permission request data
export interface PermissionRequestData {
  method: 'wallet_grantPermissions' | 'wallet_revokePermissions';
  params: WalletGrantPermissionsRequest['params'] | WalletRevokePermissionsRequest['params'];
}

export interface PermissionModalProps {
  permissionRequest?: PermissionRequestData;
  chain?: Chain;
  apiKey: string;
  origin?: string;
  onSuccess?: (result: WalletGrantPermissionsResponse | { success: boolean }) => void;
  onError?: (error: Error) => void;
}

// Format period to human-readable duration
const formatDuration = (period: SpendPeriod): string => {
  const durations: Record<SpendPeriod, string> = {
    minute: '1 Minute',
    hour: '1 Hour',
    day: '1 Day',
    week: '1 Week',
    month: '1 Month',
    year: '1 Year',
  };
  return durations[period] || period;
};

// Convert period in seconds to human-readable duration
const formatDurationFromSeconds = (seconds: number): string => {
  if (seconds === 60) return '1 Minute';
  if (seconds === 3600) return '1 Hour';
  if (seconds === 86400) return '1 Day';
  if (seconds === 604800) return '1 Week';
  if (seconds === 2592000) return '1 Month';
  if (seconds === 31536000) return '1 Year';

  // Fallback: convert to days if possible
  if (seconds % 86400 === 0) {
    const days = seconds / 86400;
    return `${days} Day${days > 1 ? 's' : ''}`;
  }

  return `${seconds} seconds`;
};

// Format timestamp to readable date
const formatExpiryDate = (timestamp: number): string => {
  const date = new Date(timestamp * 1000); // Convert to milliseconds
  return date.toLocaleString('en-US', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });
};

export const PermissionModal = ({
  permissionRequest,
  chain,
  apiKey,
  origin = 'http://localhost:3000',
  onSuccess,
  onError
}: PermissionModalProps) => {
  const { getSmartAccount } = usePasskeys();
  const [status, setStatus] = useState<string>('');
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [smartAccount, setSmartAccount] = useState<ToJustanAccountReturnType | null>(null);
  const [tokenInfo, setTokenInfo] = useState<{ decimals: number; symbol: string }>({ decimals: 18, symbol: 'ETH' });
  const [isLoadingTokenInfo, setIsLoadingTokenInfo] = useState<boolean>(false);
  const [isLoadingPermissionDetails, setIsLoadingPermissionDetails] = useState<boolean>(false);
  const [fetchedPermissionData, setFetchedPermissionData] = useState<any>(null);

  // Extract API key from rpcUrl if not provided as prop
  const extractedApiKey = useMemo(() => {
    if (apiKey) return apiKey;

    if (chain?.rpcUrl) {
      try {
        const url = new URL(chain.rpcUrl);
        return url.searchParams.get('api-key') || '';
      } catch (error) {
        console.error('Failed to parse rpcUrl:', error);
        return '';
      }
    }

    return '';
  }, [apiKey, chain?.rpcUrl]);

  console.log("api key permission", extractedApiKey);

  // Determine mode from request method
  const mode = useMemo(() => {
    if (!permissionRequest) return 'grant';
    return permissionRequest.method === 'wallet_grantPermissions' ? 'grant' : 'revoke';
  }, [permissionRequest]);

  // Extract permission details from request
  const permissionDetails = useMemo(() => {
    if (!permissionRequest) return null;

    if (mode === 'grant') {
      const params = permissionRequest.params as WalletGrantPermissionsRequest['params'];
      const [grantParams] = params;

      return {
        address: grantParams.address,
        spender: grantParams.spender,
        chainId: grantParams.chainId,
        expiry: grantParams.expiry,
        limit: grantParams.permissions.spend.limit,
        period: grantParams.permissions.spend.period,
        token: grantParams.permissions.spend.token,
      };
    } else {
      const params = permissionRequest.params as WalletRevokePermissionsRequest['params'];
      const [revokeParams] = params;

      return {
        permissionId: revokeParams.id,
        address: revokeParams.address,
      };
    }
  }, [permissionRequest, mode]);

  // Network name and icon
  const networkName = useMemo(() => {
    const chainId = chain?.id;
    if (!chainId) return 'Ethereum Mainnet';
    return getChainNameFromId(chainId);
  }, [chain]);

  const chainIconKey = useMemo(() => {
    const chainId = chain?.id;
    if (!chainId) return 'ethereum';
    return getChainIconKeyFromId(chainId);
  }, [chain]);

  // Format amount for display using token decimals
  const formattedAmount = useMemo(() => {
    if (!permissionDetails) return '0.0034';

    // For revoke mode, use fetched data from relay
    if (mode === 'revoke' && fetchedPermissionData) {
      try {
        // Convert hex allowance to BigInt
        const limitBigInt = BigInt(fetchedPermissionData.allowance);
        return formatUnits(limitBigInt, tokenInfo.decimals);
      } catch (error) {
        console.error('Error formatting revoke amount:', error);
        return '0.0034';
      }
    }

    // For grant mode, use permission details
    if (!('limit' in permissionDetails) || !permissionDetails.limit) return '0.0034';

    try {
      const limitBigInt = BigInt(permissionDetails.limit);
      return formatUnits(limitBigInt, tokenInfo.decimals);
    } catch (error) {
      console.error('Error formatting amount:', error);
      return '0.0034';
    }
  }, [permissionDetails, mode, fetchedPermissionData, tokenInfo.decimals]);

  // Format daily limit using token decimals and symbol
  const dailyLimit = useMemo(() => {
    if (!permissionDetails) return `10 ${tokenInfo.symbol}`;

    // For revoke mode, use fetched data from relay
    if (mode === 'revoke' && fetchedPermissionData) {
      try {
        const limitBigInt = BigInt(fetchedPermissionData.allowance);
        return `${formatUnits(limitBigInt, tokenInfo.decimals)} ${tokenInfo.symbol}`;
      } catch (error) {
        return `10 ${tokenInfo.symbol}`;
      }
    }

    // For grant mode, use permission details
    if (!('limit' in permissionDetails) || !permissionDetails.limit) return `10 ${tokenInfo.symbol}`;

    try {
      const limitBigInt = BigInt(permissionDetails.limit);
      return `${formatUnits(limitBigInt, tokenInfo.decimals)} ${tokenInfo.symbol}`;
    } catch (error) {
      return `10 ${tokenInfo.symbol}`;
    }
  }, [permissionDetails, mode, fetchedPermissionData, tokenInfo.decimals, tokenInfo.symbol]);

  // Duration and expiry
  const duration = useMemo(() => {
    if (!permissionDetails) return '';

    // For revoke mode, use fetched data from relay
    if (mode === 'revoke' && fetchedPermissionData) {
      const periodInSeconds = parseInt(fetchedPermissionData.period, 10);
      return formatDurationFromSeconds(periodInSeconds);
    }

    // For grant mode, use permission details
    if (!('period' in permissionDetails) || !permissionDetails.period) return '';
    return formatDuration(permissionDetails.period);
  }, [permissionDetails, mode, fetchedPermissionData]);

  const expiryDate = useMemo(() => {
    if (!permissionDetails) return '';

    // For revoke mode, use fetched data from relay
    if (mode === 'revoke' && fetchedPermissionData) {
      const endTimestamp = parseInt(fetchedPermissionData.end, 10);
      return formatExpiryDate(endTimestamp);
    }

    // For grant mode, use permission details
    if (!('expiry' in permissionDetails) || !permissionDetails.expiry) return '';
    return formatExpiryDate(permissionDetails.expiry);
  }, [permissionDetails, mode, fetchedPermissionData]);

  // Reset state
  const resetModalState = useCallback(() => {
    setStatus('');
    setIsProcessing(false);
  }, []);

  useEffect(() => {
    if (!chain) {
      resetModalState();
    }
  }, [chain, resetModalState]);

  // Fetch permission details from relay for revoke mode
  useEffect(() => {
    if (mode !== 'revoke' || !permissionDetails || !('permissionId' in permissionDetails)) {
      setIsLoadingPermissionDetails(false);
      return;
    }

    const permissionId = permissionDetails.permissionId;
    if (!permissionId || !extractedApiKey) {
      setIsLoadingPermissionDetails(false);
      return;
    }

    setIsLoadingPermissionDetails(true);
    const fetchPermissionDetails = async () => {
      try {
        const permData = await getPermissionFromRelay(permissionId, extractedApiKey);
        console.log('✅ Fetched permission details from relay:', permData);
        setFetchedPermissionData(permData);
        setIsLoadingPermissionDetails(false);
      } catch (error) {
        console.error('❌ Failed to fetch permission details:', error);
        setIsLoadingPermissionDetails(false);
      }
    };

    fetchPermissionDetails();
  }, [mode, permissionDetails, extractedApiKey]);

  // Initialize smart account when modal opens
  useEffect(() => {
    let isMounted = true;

    const initializeModal = async () => {
      if (chain) {
        try {
          setIsProcessing(false);
          console.log('🔐 Initializing permission modal');
          const account = await getSmartAccount(chain);

          if (isMounted) {
            setSmartAccount(account);
          }
        } catch (error) {
          console.error("Error initializing smart account:", error);
          if (isMounted) {
            setStatus(`Error: ${error instanceof Error ? error.message : 'Initialization failed'}`);
            onError?.(error as Error);
          }
        }
      } else {
        setSmartAccount(null);
        setStatus('');
        setIsProcessing(false);
      }
    };

    initializeModal();

    return () => {
      isMounted = false;
    };
  }, [chain, getSmartAccount, onError]);

  // Fetch token info for ERC-20 tokens
  useEffect(() => {
    if (!chain || !permissionDetails) {
      setIsLoadingTokenInfo(false);
      return;
    }

    // For revoke mode, use fetched permission data
    let tokenAddress: string | undefined;
    if (mode === 'revoke') {
      if (!fetchedPermissionData?.token) {
        setIsLoadingTokenInfo(false);
        return;
      }
      tokenAddress = fetchedPermissionData.token;
    } else {
      // For grant mode, use permission details
      if (!('token' in permissionDetails)) {
        setIsLoadingTokenInfo(false);
        return;
      }
      tokenAddress = permissionDetails.token;
    }

    // If native token, use ETH defaults
    if (isNativeToken(tokenAddress)) {
      setTokenInfo({ decimals: 18, symbol: 'ETH' });
      setIsLoadingTokenInfo(false);
      return;
    }

    // Fetch ERC-20 token info
    setIsLoadingTokenInfo(true);
    const fetchTokenInfo = async () => {
      try {
        const publicClient = createPublicClient({
          chain: {
            id: chain.id,
            name: networkName,
            nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
            rpcUrls: {
              default: { http: [chain.rpcUrl || ''] },
              public: { http: [chain.rpcUrl || ''] },
            },
          },
          transport: http(chain.rpcUrl),
        });

        const [decimals, symbol] = await Promise.all([
          publicClient.readContract({
            address: tokenAddress as Address,
            abi: erc20Abi,
            functionName: 'decimals',
          }),
          publicClient.readContract({
            address: tokenAddress as Address,
            abi: erc20Abi,
            functionName: 'symbol',
          }),
        ]);

        setTokenInfo({ decimals, symbol });
        setIsLoadingTokenInfo(false);
      } catch (error) {
        console.error('Failed to fetch token info:', error);
        // Fallback to ETH if fetch fails
        setTokenInfo({ decimals: 18, symbol: 'ETH' });
        setIsLoadingTokenInfo(false);
      }
    };

    fetchTokenInfo();
  }, [chain, permissionDetails, mode, fetchedPermissionData, networkName]);

  const handleConfirm = useCallback(async () => {
    try {
      setIsProcessing(true);
      setStatus(mode === 'grant' ? 'Granting permission...' : 'Revoking permission...');

      if (!smartAccount) {
        throw new Error('Smart account not initialized. Please try again.');
      }

      if (!chain) {
        throw new Error('Chain information is required.');
      }

      if (!permissionDetails) {
        throw new Error('Permission details are missing.');
      }

      if (mode === 'grant') {
        if (!('expiry' in permissionDetails) || !('spender' in permissionDetails) ||
            !('address' in permissionDetails) || !('chainId' in permissionDetails) ||
            !('limit' in permissionDetails) || !('period' in permissionDetails) ||
            !('token' in permissionDetails)) {
          throw new Error('Invalid grant permission parameters.');
        }

        if (!permissionDetails.address || !permissionDetails.chainId ||
            !permissionDetails.expiry || !permissionDetails.spender ||
            !permissionDetails.limit || !permissionDetails.period ||
            !permissionDetails.token) {
          throw new Error('Missing required permission parameters.');
        }

        const result = await grantPermissions(
          smartAccount,
          permissionDetails.address,
          permissionDetails.chainId,
          permissionDetails.expiry,
          permissionDetails.spender,
          {
            spend: {
              limit: permissionDetails.limit,
              period: permissionDetails.period,
              token: permissionDetails.token,
            }
          },
          chain,
          extractedApiKey
        );

        console.log('✅ Permission granted:', result);
        setStatus('Permission granted successfully!');
        onSuccess?.(result);
      } else {
        // Revoke mode
        if (!('permissionId' in permissionDetails)) {
          throw new Error('Permission ID is required for revoke.');
        }

        if (!permissionDetails.permissionId) {
          throw new Error('Permission ID is missing.');
        }

        await revokePermission(
          smartAccount,
          permissionDetails.permissionId,
          chain,
          extractedApiKey
        );

        console.log('✅ Permission revoked');
        setStatus('Permission revoked successfully!');
        onSuccess?.({ success: true });
      }

    } catch (error) {
      console.error("Error in permission operation:", error);
      const errorMessage = error instanceof Error ? error.message : String(error);
      setStatus(`Error: ${errorMessage}`);
      const errorObj = error instanceof Error ? error : new Error(errorMessage);
      onError?.(errorObj);
      setIsProcessing(false);
    }
  }, [smartAccount, chain, permissionDetails, mode, extractedApiKey, onSuccess, onError]);

  const handleCancel = useCallback(() => {
    if (!isProcessing) {
      setSmartAccount(null);
      const rejectionError = new Error('User rejected the request');
      (rejectionError as any).code = 4001;
      console.log('❌ User cancelled permission request');
      onError?.(rejectionError);
      setStatus('');
    }
  }, [isProcessing, onError]);

  // Determine token display text
  const tokenDisplay = useMemo(() => {
    // For revoke mode, use fetched data
    if (mode === 'revoke' && fetchedPermissionData?.token) {
      if (isNativeToken(fetchedPermissionData.token)) {
        return 'Native Token (ETH)';
      }
      return tokenInfo.symbol;
    }

    // For grant mode
    if (!permissionDetails || !('token' in permissionDetails)) return 'Native Token (ETH)';

    const tokenAddress = permissionDetails.token;
    if (isNativeToken(tokenAddress)) {
      return 'Native Token (ETH)';
    }

    return tokenInfo.symbol;
  }, [mode, fetchedPermissionData, permissionDetails, tokenInfo.symbol]);

  // Determine spender address
  const spenderAddress = useMemo(() => {
    // For revoke mode, use fetched data
    if (mode === 'revoke' && fetchedPermissionData?.spender) {
      return fetchedPermissionData.spender;
    }

    // For grant mode
    if (permissionDetails && 'spender' in permissionDetails && permissionDetails.spender) {
      return permissionDetails.spender;
    }

    return '0x43e...ead3';
  }, [mode, fetchedPermissionData, permissionDetails]);

  // Don't render if no permission details
  if (!permissionDetails) {
    return null;
  }

  return (
    <PermissionDialog
      open={true}
      onOpenChange={() => { console.log('onOpenChange') }}
      mode={mode}
      permissionId={mode === 'revoke' && 'permissionId' in permissionDetails ? permissionDetails.permissionId : undefined}
      spenderAddress={spenderAddress}
      origin={origin}
      amount={formattedAmount}
      token={tokenDisplay}
      duration={duration}
      expiryDate={expiryDate}
      limit={dailyLimit}
      networkName={networkName}
      chainIconKey={chainIconKey}
      onConfirm={handleConfirm}
      onCancel={handleCancel}
      isProcessing={isProcessing}
      status={status}
      isLoadingTokenInfo={isLoadingTokenInfo || isLoadingPermissionDetails}
    />
  );
};
