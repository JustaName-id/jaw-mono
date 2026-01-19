import React, { useState, useEffect, useMemo } from 'react';
import { Account, JAW_PAYMASTER_URL, SUPPORTED_CHAINS, handleGetCapabilitiesRequest, buildGrantPermissionCall, type FeeTokenCapability, UIError, standardErrorCodes, type UIErrorCode } from '@jaw.id/core';
import { PermissionModal } from '../../components/PermissionModal';
import type { PermissionUIRequest, UIHandlerConfig } from '@jaw.id/core';
import type { SpendPermission, CallPermission } from '../../components/PermissionModal/types';
import type { Address } from 'viem';
import { createPublicClient, http, formatUnits, erc20Abi } from 'viem';
import { getChainNameFromId, getChainIconKeyFromId } from '../utils';
import { useChainIcon, useEthPrice, useGasEstimation, type FeeTokenOption } from '../../hooks';
import { fetchTokenBalance, isNativeToken } from '../../utils/tokenBalance';

interface PermissionModalWrapperProps {
  request: PermissionUIRequest;
  config: UIHandlerConfig;
  onApprove: (data: unknown) => void;
  onReject: (error?: Error) => void;
}

// Format timestamp to readable date
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

// Token info cache type
type TokenInfoMap = Record<string, { decimals: number; symbol: string }>;

// Known function selectors mapping (for better UX)
const KNOWN_FUNCTION_SELECTORS: Record<string, string> = {
  '0x00000000': 'Any Function',
  '0xa9059cbb': 'transfer(address,uint256)',
  '0x23b872dd': 'transferFrom(address,address,uint256)',
  '0x095ea7b3': 'approve(address,uint256)',
  '0x': 'Empty Calldata',
};

// Resolve function selector to human-readable name
const resolveFunctionSelector = (selector: string): string => {
  const normalizedSelector = selector.toLowerCase();
  const knownName = KNOWN_FUNCTION_SELECTORS[normalizedSelector];
  return knownName || selector;
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
  const [tokenInfoMap, setTokenInfoMap] = useState<TokenInfoMap>({});
  const [feeTokens, setFeeTokens] = useState<FeeTokenOption[]>([]);
  const [feeTokensLoading, setFeeTokensLoading] = useState(true);
  const ethPrice = useEthPrice();

  // chainId can be number or hex string (like '0x1')
  const requestChainId = request.data.chainId;
  const chainId = typeof requestChainId === 'string'
    ? parseInt(requestChainId, requestChainId.startsWith('0x') ? 16 : 10)
    : (requestChainId || config.chainId || 1);
  const apiKey = config.apiKey;
  const chainName = getChainNameFromId(chainId);
  const chainIconKey = getChainIconKeyFromId(chainId);
  const chainIcon = useChainIcon(chainIconKey, 20);
  const viemChain = SUPPORTED_CHAINS.find(c => c.id === chainId);

  // Extract paymasterUrl from capabilities (EIP-5792 paymasterService capability)
  // Priority: capabilities.paymasterService.url > config.paymasters[chainId].url
  const effectivePaymasterUrl = useMemo(() => {
    const capabilitiesPaymasterUrl = request.data.capabilities?.paymasterService?.url;
    return capabilitiesPaymasterUrl || config.paymasters?.[chainId]?.url;
  }, [request.data.capabilities?.paymasterService?.url, config.paymasters, chainId]);

  // Extract paymasterContext from capabilities (for ERC-20 token payments, mode flags, etc.)
  // Priority: capabilities.paymasterService.context > config.paymasters[chainId].context
  const effectivePaymasterContext = useMemo(() => {
    const capabilitiesPaymasterContext = (request.data.capabilities?.paymasterService as { context?: Record<string, unknown> } | undefined)?.context;
    return capabilitiesPaymasterContext || config.paymasters?.[chainId]?.context;
  }, [request.data.capabilities?.paymasterService, config.paymasters, chainId]);

  // Check if this is a sponsored transaction (paymaster provided)
  const isSponsored = !!effectivePaymasterUrl;

  // Build the actual permission grant call for gas estimation
  // This uses the real approve() call data to PERMISSIONS_MANAGER_ADDRESS
  const transactionCalls = useMemo(() => {
    // Need account address to build the call - will be empty until account is initialized
    if (!request.data.address) return [];

    try {
      const permissionCall = buildGrantPermissionCall(
        request.data.address as Address,
        request.data.spender as Address,
        request.data.expiry,
        request.data.permissions
      );
      return [permissionCall];
    } catch (error) {
      console.warn('[PermissionModalWrapper] Failed to build permission grant call:', error);
      return [];
    }
  }, [request.data.address, request.data.spender, request.data.expiry, request.data.permissions]);

  // Use the gas estimation hook for both ETH and ERC-20 cost estimation
  const {
    gasFee,
    gasFeeLoading,
    gasEstimationError,
    tokenEstimates,
    selectedFeeToken,
    setSelectedFeeToken,
    isPayingWithErc20,
  } = useGasEstimation({
    account,
    transactionCalls,
    chainId,
    apiKey,
    feeTokens,
    isSponsored,
    onFeeTokensUpdate: setFeeTokens,
  });

  // Compute paymaster URL based on fee token selection (for ERC-20 paymaster)
  const computedPaymasterUrl = useMemo(() => {
    // If already sponsored via capabilities or config, use that
    if (effectivePaymasterUrl) return effectivePaymasterUrl;

    // If user selected an ERC-20 token (non-native), use ERC-20 paymaster
    if (selectedFeeToken && !selectedFeeToken.isNative) {
      return `${JAW_PAYMASTER_URL}?chainId=${chainId}${apiKey ? `&api-key=${apiKey}` : ''}`;
    }

    // Native ETH - no paymaster needed
    return undefined;
  }, [effectivePaymasterUrl, selectedFeeToken, chainId, apiKey]);

  // Compute paymaster context based on fee token selection
  const computedPaymasterContext = useMemo(() => {
    // If using ERC-20 paymaster, include token address and gas amount in context
    if (selectedFeeToken && !selectedFeeToken.isNative) {
      // Use the actual estimate from tokenEstimates if available
      const estimate = tokenEstimates.find(
        e => e.tokenAddress.toLowerCase() === selectedFeeToken.address.toLowerCase()
      );

      if (estimate) {
        // Use the actual token cost from paymaster quote
        return {
          token: selectedFeeToken.address,
          gas: estimate.tokenCost.toString(),
        };
      }

      // Fallback to client-side calculation if no estimate yet
      const gasUsd = gasFee && ethPrice ? ethPrice * Number(gasFee) : 0;
      const gasInTokenUnits = Math.ceil(gasUsd * Math.pow(10, selectedFeeToken.decimals));
      return {
        token: selectedFeeToken.address,
        gas: gasInTokenUnits.toString(),
      };
    }
    return effectivePaymasterContext;
  }, [selectedFeeToken, effectivePaymasterContext, tokenEstimates, gasFee, ethPrice]);

  // Get spends array from request (now using spends plural)
  const spendsData = request.data.permissions.spends || [];

  // Get calls array from request
  const callsData = request.data.permissions.calls || [];

  // Fetch token info for all unique tokens in spends
  useEffect(() => {
    if (spendsData.length === 0) {
      setIsLoadingTokenInfo(false);
      return;
    }

    let isMounted = true;
    setIsLoadingTokenInfo(true);

    const fetchAllTokenInfo = async () => {
      const newTokenInfoMap: TokenInfoMap = {};

      // Get unique token addresses
      const uniqueTokens = Array.from(new Set(spendsData.map((spend) => spend.token))) as string[];

      // Build RPC URL
      const rpcUrl = `https://rpc.jaw.id/?chainId=${chainId}${apiKey ? `&api-key=${apiKey}` : ''}`;

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
              id: chainId,
              name: chainName,
              nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
              rpcUrls: {
                default: { http: [rpcUrl] },
                public: { http: [rpcUrl] },
              },
            },
            transport: http(rpcUrl),
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
          // Fallback to showing truncated token address
          newTokenInfoMap[tokenAddress] = {
            decimals: 18,
            symbol: tokenAddress.slice(0, 6) + '...' + tokenAddress.slice(-4),
          };
        }
      }

      if (isMounted) {
        setTokenInfoMap(prev => ({ ...prev, ...newTokenInfoMap }));
        setIsLoadingTokenInfo(false);
      }
    };

    fetchAllTokenInfo();

    return () => {
      isMounted = false;
    };
  }, [chainId, spendsData, chainName, apiKey]);

  // Fetch fee tokens from capabilities (same pattern as TransactionModalWrapper)
  useEffect(() => {
    let isMounted = true;

    const fetchFeeTokensData = async () => {
      if (!viemChain || !apiKey) {
        setFeeTokensLoading(false);
        return;
      }

      // If sponsored, no need to fetch fee tokens
      if (effectivePaymasterUrl) {
        setFeeTokensLoading(false);
        return;
      }

      try {
        setFeeTokensLoading(true);

        // Fetch capabilities from JAW RPC
        const capabilities = await handleGetCapabilitiesRequest(
          { method: 'wallet_getCapabilities', params: [] },
          apiKey || '',
          true // showTestnets
        );

        const chainIdHex = `0x${chainId.toString(16)}` as `0x${string}`;
        const feeTokenCap = capabilities?.[chainIdHex]?.feeToken as FeeTokenCapability | undefined;

        if (!feeTokenCap?.supported || !feeTokenCap?.tokens?.length) {
          if (isMounted) setFeeTokensLoading(false);
          return;
        }

        // Get RPC URL for balance fetching
        const rpcUrl = viemChain?.rpcUrls?.default?.http?.[0] || `https://eth.llamarpc.com`;

        // Fetch balances in parallel
        const tokensWithBalances = await Promise.all(
          feeTokenCap.tokens.map(async (token) => {
            try {
              const balance = await fetchTokenBalance(token.address, request.data.address, rpcUrl);
              const balanceFormatted = formatUnits(balance, token.decimals);
              const tokenIsNative = isNativeToken(token.address);
              // For native token (ETH): selectable if any balance (gas estimation will catch insufficient)
              // For ERC-20 tokens: require at least 0.5 units
              const isSelectable = tokenIsNative
                ? balance > 0n
                : parseFloat(balanceFormatted) >= 0.5;

              return {
                uid: token.uid,
                symbol: token.symbol,
                address: token.address,
                decimals: token.decimals,
                balance,
                balanceFormatted,
                isNative: tokenIsNative,
                isSelectable,
                logoURI: token.logoURI,
              } as FeeTokenOption;
            } catch (error) {
              console.warn(`Failed to fetch balance for ${token.symbol}:`, error);
              return {
                uid: token.uid,
                symbol: token.symbol,
                address: token.address,
                decimals: token.decimals,
                balance: 0n,
                balanceFormatted: '0',
                isNative: isNativeToken(token.address),
                isSelectable: false,
                logoURI: token.logoURI,
              } as FeeTokenOption;
            }
          })
        );

        if (isMounted) {
          setFeeTokens(tokensWithBalances);
          // Note: Initial token selection is handled by useGasEstimation hook
        }
      } catch (error) {
        console.warn('[PermissionModalWrapper] Failed to fetch fee tokens:', error);
      } finally {
        if (isMounted) setFeeTokensLoading(false);
      }
    };

    fetchFeeTokensData();

    return () => {
      isMounted = false;
    };
  }, [chainId, apiKey, request.data.address, effectivePaymasterUrl, viemChain]);

  // Initialize account
  useEffect(() => {
    let isMounted = true;

    const initializeAccount = async () => {
      try {
        const restoredAccount = await Account.get({
          chainId,
          apiKey,
          paymasterUrl: computedPaymasterUrl,
        });
        if (isMounted) {
          setAccount(restoredAccount);
        }
      } catch (error) {
        console.error('[PermissionModalWrapper] Error initializing account:', error);
        onReject(new Error('Failed to load account. Please try again.'));
      }
    };

    initializeAccount();

    return () => {
      isMounted = false;
    };
  }, [apiKey, chainId, computedPaymasterUrl]);

  // Note: Gas estimation is now handled by useGasEstimation hook

  // Convert to SpendPermission array format expected by PermissionModal
  const spends = useMemo<SpendPermission[]>(() => spendsData.map(spend => {
    const tokenInfo = tokenInfoMap[spend.token] || (isNativeToken(spend.token)
      ? { decimals: 18, symbol: 'ETH' }
      : { decimals: 18, symbol: spend.token.slice(0, 6) + '...' + spend.token.slice(-4) });

    const allowance = BigInt(spend.allowance);
    const amount = formatUnits(allowance, tokenInfo.decimals);
    const limit = `${amount} ${tokenInfo.symbol}`;

    // Format duration with multiplier (defaults to 1 if not provided)
    const multiplier = spend.multiplier ?? 1;
    const duration = `${multiplier} ${spend.unit}${multiplier > 1 ? 's' : ''}`;

    return {
      amount,
      token: isNativeToken(spend.token) ? 'Native (ETH)' : tokenInfo.symbol,
      tokenAddress: spend.token,
      duration,
      limit,
    };
  }), [spendsData, tokenInfoMap]);

  // Format call permissions
  const calls = useMemo<CallPermission[]>(() => callsData.map(call => ({
    target: call.target,
    selector: call.selector || '',
    functionSignature: call.functionSignature || resolveFunctionSelector(call.selector || ''),
  })), [callsData]);

  // Format expiry date
  const expiryDate = useMemo(() => {
    return formatExpiryDate(request.data.expiry);
  }, [request.data.expiry]);

  // Generate warning message based on actual permissions
  const warningMessage = useMemo(() => {
    const parts: string[] = [];

    // Describe spend permissions
    if (spends.length > 0) {
      const spendDescriptions = spends.map(spend => {
        // Remove "1 " prefix from duration (e.g., "1 Day" -> "day", "1 Week" -> "week")
        const normalizedDuration = spend.duration.replace(/^1\s+/, '').toLowerCase();
        // Handle "forever" specially - no "per" prefix needed
        if (normalizedDuration === 'forever') {
          return spend.limit;
        }
        return `${spend.limit} per ${normalizedDuration}`;
      });
      parts.push(`spend up to ${spendDescriptions.join(', ')}`);
    }

    // Describe call permissions
    if (calls.length > 0) {
      const callDescriptions = calls.map(call => {
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
  }, [spends, calls, expiryDate]);

  const handleConfirm = async () => {
    if (!account) {
      console.error('[PermissionModalWrapper] Account not initialized');
      return;
    }

    setIsProcessing(true);
    setStatus('Granting permissions...');
    try {
      // Use the spends array directly from the request (already in correct format)
      const permissionsDetail = {
        spends: request.data.permissions.spends || [],
        calls: request.data.permissions.calls,
      };

      // Grant permissions using Account class with paymaster context
      const result = await account.grantPermissions(
        request.data.expiry,
        request.data.spender as Address,
        permissionsDetail,
        computedPaymasterUrl,
        computedPaymasterContext
      );

      setStatus('Permissions granted successfully!');
      onApprove(result);
    } catch (error) {
      console.error('[PermissionModalWrapper] Permission grant failed:', error);
      const errorObj = error instanceof Error ? error : new Error(String(error));
      const errorMessage = errorObj.message;
      setStatus(`Error: ${errorMessage}`);

      // Check if user cancelled passkey prompt (NotAllowedError)
      if (errorObj.name === 'NotAllowedError') {
        setStatus('Cancelled by user');
        setTimeout(() => setStatus(undefined), 2000);
        return;
      }

      // Internal error
      onReject(new UIError(standardErrorCodes.rpc.internal as UIErrorCode, errorMessage));
    } finally {
      setIsProcessing(false);
    }
  };

  const handleCancel = () => {
    onReject(UIError.userRejected());
  };

  // Determine if fee token selector should be shown (not sponsored and has ERC-20 options)
  const showFeeTokenSelector = !isSponsored && feeTokens.some(t => !t.isNative);

  // Calculate gas fee in USD for display
  const gasFeeUsd = gasFee && gasFee !== 'sponsored' && ethPrice
    ? (ethPrice * Number(gasFee)).toFixed(2)
    : undefined;

  return (
    <PermissionModal
      open={true}
      onOpenChange={(open) => !open && handleCancel()}
      mode="grant"
      spenderAddress={request.data.spender}
      origin="Mobile App"
      spends={spends}
      calls={calls}
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
      // Fee token props for ERC-20 paymaster (if modal supports them)
      // feeTokens={feeTokens}
      // feeTokensLoading={feeTokensLoading}
      // selectedFeeToken={selectedFeeToken}
      // onFeeTokenSelect={setSelectedFeeToken}
      // showFeeTokenSelector={showFeeTokenSelector}
      // isPayingWithErc20={isPayingWithErc20}
      // gasFee={gasFee}
      // gasFeeUsd={gasFeeUsd}
      // gasEstimationError={gasEstimationError}
    />
  );
};
