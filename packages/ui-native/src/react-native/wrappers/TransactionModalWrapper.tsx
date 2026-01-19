import React, { useState, useEffect, useMemo } from 'react';
import { Account, type PaymasterConfig, JAW_PAYMASTER_URL, SUPPORTED_CHAINS, handleGetCapabilitiesRequest, type FeeTokenCapability, UIError, standardErrorCodes, type UIErrorCode } from '@jaw.id/core';
import { TransactionModal } from '../../components/TransactionModal';
import type { TransactionUIRequest, SendTransactionUIRequest, UIHandlerConfig } from '@jaw.id/core';
import type { Address, Hex } from 'viem';
import { formatUnits } from 'viem';
import { getChainNameFromId, getChainIconKeyFromId } from '../utils';
import { useChainIcon, useEthPrice, useGasEstimation, type FeeTokenOption } from '../../hooks';
import { fetchTokenBalance, isNativeToken } from '../../utils/tokenBalance';

interface TransactionModalWrapperProps {
  request: TransactionUIRequest | SendTransactionUIRequest;
  config: UIHandlerConfig;
  onApprove: (data: unknown) => void;
  onReject: (error?: Error) => void;
}

export const TransactionModalWrapper: React.FC<TransactionModalWrapperProps> = ({
  request,
  config,
  onApprove,
  onReject,
}) => {
  const [isSending, setIsSending] = useState(false);
  const [account, setAccount] = useState<Account | null>(null);
  const [status, setStatus] = useState<string | undefined>();
  const ethPrice = useEthPrice();

  // Fee token state for ERC-20 paymaster
  const [feeTokens, setFeeTokens] = useState<FeeTokenOption[]>([]);
  const [feeTokensLoading, setFeeTokensLoading] = useState(false);

  const chainId = config.chainId || 1;
  const apiKey = config.apiKey;
  const chainName = getChainNameFromId(chainId);
  const chainIconKey = getChainIconKeyFromId(chainId);
  const chainIcon = useChainIcon(chainIconKey, 20);
  const viemChain = SUPPORTED_CHAINS.find(c => c.id === chainId);

  // Determine if this is wallet_sendCalls (multi-call) or eth_sendTransaction (single)
  const isMultiCall = request.type === 'wallet_sendCalls';

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

  const isSponsored = !!effectivePaymasterUrl;

  // Transform calls to transactions format expected by modal
  const transactions = useMemo(() => {
    if (isMultiCall) {
      const multiCallRequest = request as TransactionUIRequest;
      return multiCallRequest.data.calls.map((call: any) => ({
        from: '',
        to: call.to || '',
        value: call.value ? BigInt(call.value).toString() : '0',
        data: call.data || '0x',
      }));
    } else {
      const singleTxRequest = request as SendTransactionUIRequest;
      return [{
        from: '',
        to: singleTxRequest.data.to || '',
        value: singleTxRequest.data.value
          ? BigInt(singleTxRequest.data.value).toString()
          : '0',
        data: singleTxRequest.data.data || '0x',
      }];
    }
  }, [isMultiCall, request]);

  // Convert to call format for Account operations
  const transactionCalls = useMemo(() => {
    if (isMultiCall) {
      const multiCallRequest = request as TransactionUIRequest;
      return multiCallRequest.data.calls.map(call => ({
        to: call.to as Address,
        value: call.value ? BigInt(call.value) : undefined,
        data: (call.data || '0x') as Hex,
      }));
    } else {
      const singleTxRequest = request as SendTransactionUIRequest;
      return [{
        to: singleTxRequest.data.to as Address,
        value: singleTxRequest.data.value ? BigInt(singleTxRequest.data.value) : undefined,
        data: (singleTxRequest.data.data || '0x') as Hex,
      }];
    }
  }, [isMultiCall, request]);

  // Permission ID for permission-based execution
  const permissionId = request.data.capabilities?.permissions?.id as Hex | undefined;

  // Use gas estimation hook for parallel ETH and ERC-20 estimation
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
    permissionId,
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
  }, [selectedFeeToken, effectivePaymasterContext, gasFee, ethPrice, tokenEstimates]);

  // Fetch fee tokens when not sponsored (for ERC-20 paymaster option)
  useEffect(() => {
    // Skip if already sponsored via capabilities or config
    if (effectivePaymasterUrl) return;

    let isMounted = true;

    const fetchFeeTokensData = async () => {
      setFeeTokensLoading(true);
      try {
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

        // Get from address
        const fromAddress = isMultiCall
          ? (request as TransactionUIRequest).data.from
          : (request as SendTransactionUIRequest).data.from;

        // Fetch balances in parallel
        const tokensWithBalances = await Promise.all(
          feeTokenCap.tokens.map(async (token) => {
            try {
              const balance = await fetchTokenBalance(token.address, fromAddress, rpcUrl);
              const balanceFormatted = formatUnits(balance, token.decimals);
              const isNative = isNativeToken(token.address);
              // For native token (ETH): selectable if any balance (gas estimation will catch insufficient)
              // For ERC-20 tokens: require at least 0.5 units
              const isSelectable = isNative
                ? balance > 0n
                : parseFloat(balanceFormatted) >= 0.5;

              return {
                uid: token.uid,
                symbol: token.symbol,
                address: token.address,
                decimals: token.decimals,
                balance,
                balanceFormatted,
                isNative,
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
        console.warn('[TransactionModalWrapper] Failed to fetch fee tokens:', error);
      } finally {
        if (isMounted) setFeeTokensLoading(false);
      }
    };

    fetchFeeTokensData();

    return () => {
      isMounted = false;
    };
  }, [chainId, apiKey, effectivePaymasterUrl, viemChain, isMultiCall, request]);

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

          // Update from address in transactions
          const address = await restoredAccount.getAddress();
          transactions.forEach((tx: any) => {
            tx.from = address;
          });
        }
      } catch (error) {
        console.error('[TransactionModalWrapper] Error initializing account:', error);
        onReject(new Error('Failed to load account. Please try again.'));
      }
    };

    initializeAccount();

    return () => {
      isMounted = false;
    };
  }, [chainId, apiKey, computedPaymasterUrl]);

  // Note: Gas estimation is now handled by useGasEstimation hook

  const handleSend = async () => {
    if (!account) {
      console.error('[TransactionModalWrapper] Account not initialized');
      return;
    }

    setIsSending(true);
    setStatus('Sending transaction...');

    try {
      const result = await account.sendCalls(
        transactionCalls,
        permissionId ? { permissionId } : undefined,
        computedPaymasterUrl,
        computedPaymasterContext
      );

      setStatus('Transaction successful!');
      onApprove({
        id: result.id,
        chainId: result.chainId,
      });
    } catch (error) {
      console.error('[TransactionModalWrapper] Transaction failed:', error);
      const errorObj = error instanceof Error ? error : new Error(String(error));
      const errorMessage = errorObj.message;
      setStatus(`Error: ${errorMessage}`);

      // Check if user cancelled passkey prompt (NotAllowedError)
      if (errorObj.name === 'NotAllowedError') {
        setStatus('Cancelled by user');
        setTimeout(() => setStatus(undefined), 2000);
        return;
      }

      // Check for insufficient funds errors
      if (
        errorMessage.includes('AA21') ||
        errorMessage.includes("didn't pay prefund") ||
        errorMessage.includes('insufficient') ||
        errorMessage.includes('exceeds balance')
      ) {
        // Transaction rejected due to funds/gas issues
        onReject(new UIError(standardErrorCodes.rpc.transactionRejected as UIErrorCode, errorMessage));
      } else {
        // Internal error
        onReject(new UIError(standardErrorCodes.rpc.internal as UIErrorCode, errorMessage));
      }
    } finally {
      setIsSending(false);
    }
  };

  const handleCancel = () => {
    onReject(UIError.userRejected());
  };

  // Determine if fee token selector should be shown (not sponsored and has ERC-20 options)
  const showFeeTokenSelector = !isSponsored && feeTokens.some(t => !t.isNative);

  // Convert gasFee to string format expected by modal
  const gasFeeString = gasFee === 'sponsored' ? 'sponsored' : gasFee;

  // Calculate gas fee in USD for display
  const gasFeeUsd = gasFee && gasFee !== 'sponsored' && ethPrice
    ? (ethPrice * Number(gasFee)).toFixed(2)
    : undefined;

  return (
    <TransactionModal
      open={true}
      onOpenChange={(open) => !open && handleCancel()}
      transactions={transactions}
      gasFee={gasFeeString}
      gasFeeUsd={gasFeeUsd}
      isSponsored={isSponsored}
      networkName={chainName}
      chainIcon={chainIcon}
      onConfirm={handleSend}
      onCancel={handleCancel}
      isProcessing={isSending}
      isEstimatingGas={gasFeeLoading}
      status={status}
      // Fee token props for ERC-20 paymaster (if modal supports them)
      // feeTokens={feeTokens}
      // feeTokensLoading={feeTokensLoading}
      // selectedFeeToken={selectedFeeToken}
      // onFeeTokenSelect={setSelectedFeeToken}
      // showFeeTokenSelector={showFeeTokenSelector}
      // isPayingWithErc20={isPayingWithErc20}
    />
  );
};
