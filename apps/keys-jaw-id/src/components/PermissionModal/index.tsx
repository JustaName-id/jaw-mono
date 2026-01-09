'use client'

import { PermissionDialog } from "@jaw.id/ui";
import { useCallback, useEffect, useMemo, useState } from "react";
import { formatUnits, erc20Abi, createPublicClient, http, type Address } from "viem";
import { getChainNameFromId, getChainIconKeyFromId } from "../../lib/chain-handlers";
import { usePasskeys } from "../../hooks";
import {
    Account,
    type Chain,
    type WalletGrantPermissionsRequest,
    type WalletRevokePermissionsRequest,
    type WalletGrantPermissionsResponse,
    type SpendPeriod,
    getPermissionFromRelay,
    standardErrorCodes,
} from "@jaw.id/core";

// ERC-7528 native token address
const NATIVE_TOKEN = '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE';

// Known function selectors mapping
const KNOWN_FUNCTION_SELECTORS: Record<string, string> = {
  '0x32323232': 'Any Function',
  '0xe0e0e0e0': 'Empty Calldata',
  '0xcc53287f': 'lockdown((address,address)[])',
  '0x87517c45': 'approve(address,address,uint160,uint48)',
  '0x095ea7b3': 'approve(address,uint256)',
  '0x23b872dd': 'transferFrom(address,address,uint256)',
  '0xa9059cbb': 'transfer(address,uint256)',
};

// Resolve function selector to human-readable name
const resolveFunctionSelector = (selector: string): string => {
  const normalizedSelector = selector.toLowerCase();
  const knownName = KNOWN_FUNCTION_SELECTORS[normalizedSelector];
  return knownName || selector;
};

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
  onError?: (error: Error, errorCode?: number) => void;
}

// Format period to human-readable duration with multiplier support
const formatDuration = (period: SpendPeriod, multiplier = 1): string => {
  const periodLabels: Record<SpendPeriod, string> = {
    minute: 'Minute',
    hour: 'Hour',
    day: 'Day',
    week: 'Week',
    month: 'Month',
    year: 'Year',
    forever: 'Forever',
  };

  const label = periodLabels[period] || period;

  // Forever doesn't need a multiplier
  if (period === 'forever') {
    return 'Forever';
  }

  // Add 's' for plural when multiplier > 1
  const pluralSuffix = multiplier > 1 ? 's' : '';
  return `${multiplier} ${label}${pluralSuffix}`;
};

// Convert period unit and multiplier from relay to human-readable duration
const formatDurationFromRelay = (unit: string, multiplier = 1): string => {
  const periodLabels: Record<string, string> = {
    minute: 'Minute',
    hour: 'Hour',
    day: 'Day',
    week: 'Week',
    month: 'Month',
    year: 'Year',
    forever: 'Forever',
  };

  const label = periodLabels[unit] || unit;

  // Forever doesn't need a multiplier
  if (unit === 'forever') {
    return 'Forever';
  }

  // Add 's' for plural when multiplier > 1
  const pluralSuffix = multiplier > 1 ? 's' : '';
  return `${multiplier} ${label}${pluralSuffix}`;
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

// Token info cache type
type TokenInfoMap = Record<string, { decimals: number; symbol: string }>;

export const PermissionModal = ({
  permissionRequest,
  chain,
  apiKey,
  origin = 'http://localhost:3000',
  onSuccess,
  onError
}: PermissionModalProps) => {
  const { getAccount } = usePasskeys();
  const [status, setStatus] = useState<string>('');
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [account, setAccount] = useState<Account | null>(null);
  const [isLoadingSmartAccount, setIsLoadingSmartAccount] = useState<boolean>(true); // Start true to prevent early clicks
  const [tokenInfoMap, setTokenInfoMap] = useState<TokenInfoMap>({});
  const [isLoadingTokenInfo, setIsLoadingTokenInfo] = useState<boolean>(true); // Start true to prevent early clicks
  const [isLoadingPermissionDetails, setIsLoadingPermissionDetails] = useState<boolean>(true); // Start true to prevent early clicks
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

  // Determine mode from request method
  const mode = useMemo(() => {
    if (!permissionRequest) return 'grant';
    return permissionRequest.method === 'wallet_grantPermissions' ? 'grant' : 'revoke';
  }, [permissionRequest]);

  // Extract paymasterUrl from capabilities (EIP-5792 paymasterService capability)
  // Priority: capabilities.paymasterService.url > chain.paymaster.url
  const effectivePaymasterUrl = useMemo(() => {
    if (!permissionRequest) return chain?.paymaster?.url;

    const params = permissionRequest.params[0];
    const capabilitiesPaymasterUrl = params?.capabilities?.paymasterService?.url;
    return capabilitiesPaymasterUrl || chain?.paymaster?.url;
  }, [permissionRequest, chain?.paymaster?.url]);

  // Extract permission details from request
  const permissionDetails = useMemo(() => {
    if (!permissionRequest) return null;

    if (mode === 'grant') {
      const params = permissionRequest.params as WalletGrantPermissionsRequest['params'];
      const [grantParams] = params;

      return {
        spender: grantParams.spender,
        expiry: grantParams.expiry,
        spends: grantParams.permissions.spends || [],
        calls: grantParams.permissions.calls || [],
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

  // Get spends array based on mode
  const spendsData = useMemo(() => {
    if (mode === 'revoke' && fetchedPermissionData?.spends) {
      return fetchedPermissionData.spends;
    }
    if (mode === 'grant' && permissionDetails && 'spends' in permissionDetails) {
      return permissionDetails.spends;
    }
    return [];
  }, [mode, fetchedPermissionData, permissionDetails]);

  // Get calls array based on mode
  const callsData = useMemo(() => {
    if (mode === 'revoke' && fetchedPermissionData?.calls) {
      return fetchedPermissionData.calls;
    }
    if (mode === 'grant' && permissionDetails && 'calls' in permissionDetails) {
      return permissionDetails.calls;
    }
    return [];
  }, [mode, fetchedPermissionData, permissionDetails]);

  // Format spend permissions with token info
  const formattedSpends = useMemo(() => {
    return spendsData.map((spend: any) => {
      const tokenAddress = spend.token;
      const tokenInfo = tokenInfoMap[tokenAddress] || { decimals: 18, symbol: 'ETH' };

      let amount, limit, duration;

      if (mode === 'revoke') {
        // From relay - allowance is hex string, unit is period string, multiplier is number
        const allowance = BigInt(spend.allowance);
        amount = formatUnits(allowance, tokenInfo.decimals);
        limit = `${amount} ${tokenInfo.symbol}`;
        duration = formatDurationFromRelay(spend.unit, spend.multiplier ?? 1);
      } else {
        // From grant request - allowance is string, unit is SpendPeriod, multiplier is optional
        const allowanceValue = BigInt(spend.allowance);
        amount = formatUnits(allowanceValue, tokenInfo.decimals);
        limit = `${amount} ${tokenInfo.symbol}`;
        duration = formatDuration(spend.unit as SpendPeriod, spend.multiplier ?? 1);
      }

      return {
        amount,
        token: isNativeToken(tokenAddress)
          ? 'Native (ETH)'
          : (tokenInfo.symbol === tokenAddress
              ? `${tokenAddress.slice(0, 6)}...${tokenAddress.slice(-4)}`
              : tokenInfo.symbol),
        tokenAddress,
        duration,
        limit,
      };
    });
  }, [spendsData, tokenInfoMap, mode]);

  // Format call permissions
  const formattedCalls = useMemo(() => {
    return callsData.map((call: any) => ({
      target: call.target,
      selector: call.selector,
      functionSignature: call.functionSignature || resolveFunctionSelector(call.selector),
    }));
  }, [callsData]);

  // Expiry date
  const expiryDate = useMemo(() => {
    if (!permissionDetails) return '';

    if (mode === 'revoke' && fetchedPermissionData) {
      const endTimestamp = parseInt(fetchedPermissionData.end, 10);
      return formatExpiryDate(endTimestamp);
    }

    if ('expiry' in permissionDetails && permissionDetails.expiry) {
      return formatExpiryDate(permissionDetails.expiry);
    }

    return '';
  }, [permissionDetails, mode, fetchedPermissionData]);

  // Spender address
  const spenderAddress = useMemo(() => {
    if (mode === 'revoke' && fetchedPermissionData?.spender) {
      return fetchedPermissionData.spender;
    }

    if (permissionDetails && 'spender' in permissionDetails && permissionDetails.spender) {
      return permissionDetails.spender;
    }

    return '0x43e...ead3';
  }, [mode, fetchedPermissionData, permissionDetails]);

  // Generate warning message based on actual permissions
  const warningMessage = useMemo(() => {
    if (mode !== 'grant') return undefined;

    const parts: string[] = [];

    // Describe spend permissions
    if (formattedSpends.length > 0) {
      const spendDescriptions = formattedSpends.map(
        (spend: { limit: string; duration: string }) => {
          // Remove "1 " prefix from duration (e.g., "1 Day" -> "day", "1 Week" -> "week")
          const normalizedDuration = spend.duration.replace(/^1\s+/, '').toLowerCase();
          // Handle "forever" specially - no "per" prefix needed
          if (normalizedDuration === 'forever') {
            return spend.limit;
          }
          return `${spend.limit} per ${normalizedDuration}`;
        }
      );
      parts.push(`spend up to ${spendDescriptions.join(', ')}`);
    }

    // Describe call permissions
    if (formattedCalls.length > 0) {
      const callDescriptions = formattedCalls.map((call: { functionSignature: string }) => {
        const fnName = call.functionSignature;
        // Check for special selectors
        if (fnName === 'Any Function') {
          return 'call any function';
        }
        if (fnName === 'Empty Calldata') {
          return 'send transactions with empty calldata';
        }
        // Extract just the function name from signature like "transfer(address,uint256)"
        const simpleName = fnName.split('(')[0];
        return `call ${simpleName}`;
      });

      // Deduplicate and join
      const uniqueCalls = [...new Set(callDescriptions)];
      parts.push(uniqueCalls.join(', '));
    }

    if (parts.length === 0) {
      return `You are granting permissions to this dApp until ${expiryDate}. Only approve if you trust this dApp.`;
    }

    return `This will allow the dApp to ${parts.join(' and ')} on your behalf until ${expiryDate}. Only approve if you trust this dApp.`;
  }, [mode, formattedSpends, formattedCalls, expiryDate]);

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

  // Initialize account when modal opens or permission request changes
  useEffect(() => {
    let isMounted = true;

    const initializeModal = async () => {
      if (chain) {
        try {
          setIsProcessing(false);
          setIsLoadingSmartAccount(true);
          console.log('Initializing permission modal');
          
          // Merge paymasterUrl from capabilities into chain before creating account
          const chainWithPaymaster = {
            ...chain,
            ...(effectivePaymasterUrl && { paymaster: { url: effectivePaymasterUrl } }),
          };
          
          const restoredAccount = await getAccount(chainWithPaymaster, extractedApiKey);

          if (isMounted) {
            setAccount(restoredAccount);
            setIsLoadingSmartAccount(false);
          }
        } catch (error) {
          console.error("Error initializing account:", error);
          if (isMounted) {
            setIsLoadingSmartAccount(false);
            setStatus(`Error: ${error instanceof Error ? error.message : 'Initialization failed'}`);
            const errorObj = error instanceof Error ? error : new Error(String(error));
            // Check if user cancelled passkey prompt (NotAllowedError)
            const errorCode = error instanceof Error && error.name === 'NotAllowedError'
              ? standardErrorCodes.provider.userRejectedRequest
              : standardErrorCodes.rpc.internal;
            onError?.(errorObj, errorCode);
          }
        }
      } else {
        setAccount(null);
        setIsLoadingSmartAccount(false);
        setStatus('');
        setIsProcessing(false);
      }
    };

    initializeModal();

    return () => {
      isMounted = false;
    };
  }, [chain, permissionRequest, extractedApiKey, effectivePaymasterUrl, getAccount, onError]);

  // Fetch token info for all unique tokens in spends
  useEffect(() => {
    if (!chain || spendsData.length === 0) {
      setIsLoadingTokenInfo(false);
      return;
    }

    setIsLoadingTokenInfo(true);

    const fetchAllTokenInfo = async () => {
      const newTokenInfoMap: TokenInfoMap = {};

      // Get unique token addresses
      const uniqueTokens = Array.from(new Set(spendsData.map((spend: any) => spend.token as string))) as string[];

      for (const tokenAddress of uniqueTokens) {
        // Skip if already fetched
        if (tokenInfoMap[tokenAddress]) {
          newTokenInfoMap[tokenAddress] = tokenInfoMap[tokenAddress];
          continue;
        }

        // If native token, use ETH defaults
        if (isNativeToken(tokenAddress)) {
          newTokenInfoMap[tokenAddress] = { decimals: 18, symbol: 'ETH' };
          continue;
        }

        // Fetch ERC-20 token info
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

          newTokenInfoMap[tokenAddress] = { decimals, symbol };
        } catch (error) {
          console.error(`Failed to fetch token info for ${tokenAddress}:`, error);
          // Fallback to showing the token address
          newTokenInfoMap[tokenAddress] = { decimals: 18, symbol: tokenAddress };
        }
      }

      setTokenInfoMap(prev => ({ ...prev, ...newTokenInfoMap }));
      setIsLoadingTokenInfo(false);
    };

    fetchAllTokenInfo();
  }, [chain, spendsData, networkName]);

  const handleConfirm = useCallback(async () => {
    try {
      setIsProcessing(true);
      setStatus(mode === 'grant' ? 'Granting permissions...' : 'Revoking permission...');

      if (!account) {
        throw new Error('Account not initialized. Please try again.');
      }

      if (!chain) {
        throw new Error('Chain information is required.');
      }

      if (!permissionDetails) {
        throw new Error('Permission details are missing.');
      }

      // effectivePaymasterUrl is extracted from capabilities or chain config via useMemo above

      if (mode === 'grant') {
        if (!('expiry' in permissionDetails) || !('spender' in permissionDetails)) {
          throw new Error('Invalid grant permission parameters.');
        }

        if (!permissionDetails.expiry) {
          throw new Error('Expiry is required for granting permissions.');
        }

        if (!permissionDetails.spender) {
          throw new Error('Spender is required for granting permissions.');
        }

        // Account.grantPermissions uses the chain's paymasterUrl (which we set from capabilities)
        const result = await account.grantPermissions(
          permissionDetails.expiry,
          permissionDetails.spender,
          {
            spends: permissionDetails.spends,
            calls: permissionDetails.calls,
          }
        );

        console.log('Permissions granted:', result);
        setStatus('Permissions granted successfully!');
        onSuccess?.(result);
      } else {
        // Revoke mode
        if (!('permissionId' in permissionDetails)) {
          throw new Error('Permission ID is required for revoke.');
        }

        if (!permissionDetails.permissionId) {
          throw new Error('Permission ID is missing.');
        }

        // Account.revokePermission uses the chain's paymasterUrl (which we set from capabilities)
        await account.revokePermission(permissionDetails.permissionId);

        console.log('Permission revoked');
        setStatus('Permission revoked successfully!');
        onSuccess?.({ success: true });
      }

    } catch (error) {
      console.error("Error in permission operation:", error);
      const errorMessage = error instanceof Error ? error.message : String(error);
      setStatus(`Error: ${errorMessage}`);
      const errorObj = error instanceof Error ? error : new Error(errorMessage);
      // Check if user cancelled passkey prompt (NotAllowedError)
      const errorCode = error instanceof Error && error.name === 'NotAllowedError'
        ? standardErrorCodes.provider.userRejectedRequest
        : standardErrorCodes.rpc.internal;
      onError?.(errorObj, errorCode);
      setIsProcessing(false);
    }
  }, [account, chain, permissionDetails, mode, onSuccess, onError]);

  const handleCancel = useCallback(() => {
    if (!isProcessing) {
      setAccount(null);
      console.log('❌ User cancelled permission request');
      // User rejected request (EIP-1193 code 4001)
      onError?.(new Error('User rejected the request'), standardErrorCodes.provider.userRejectedRequest);
      setStatus('');
    }
  }, [isProcessing, onError]);

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
      spends={formattedSpends}
      calls={formattedCalls}
      expiryDate={expiryDate}
      networkName={networkName}
      chainId={chain?.id}
      chainIconKey={chainIconKey}
      onConfirm={handleConfirm}
      onCancel={handleCancel}
      isProcessing={isProcessing}
      status={status}
      isLoadingTokenInfo={isLoadingTokenInfo || isLoadingPermissionDetails || isLoadingSmartAccount}
      warningMessage={warningMessage}
    />
  );
};
