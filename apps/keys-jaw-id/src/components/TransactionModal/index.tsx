'use client'

import { TransactionDialog, TransactionData, FeeTokenOption, fetchTokenBalance, isNativeToken } from "@jaw.id/ui";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Address, Hash, formatUnits } from "viem";
import { getChainNameFromId, getChainIconKeyFromId } from "../../lib/chain-handlers";
import { usePasskeys, useAuth } from "../../hooks";
import { Account, type Chain, type TransactionCall, standardErrorCodes, handleGetCapabilitiesRequest, JAW_PAYMASTER_URL, type FeeTokenCapability } from "@jaw.id/core";

// Transaction execution result
export interface TransactionResult {
  hash?: Hash;
  sendCallsId?: string;
  userOpHash?: Hash;
  id?:Hash;
  chainId?: number;
}

// Transaction request data with method-specific metadata
export interface TransactionRequestData {
  method: 'wallet_sendCalls' | 'eth_sendTransaction';
  transactions: Array<{
    to?: string;
    data?: string;
    value: string;
    chainId: number;
  }>;
  chainId: number;
  paymasterUrl?: string;
  paymasterContext?: Record<string, unknown>;
  // wallet_sendCalls specific fields
  atomicRequired?: boolean;
  version?: string;
  callsId?: string;
  // Permission ID for permission-based execution
  permissionId?: `0x${string}`;
}

export interface TransactionModalProps {
  transactionRequest?: TransactionRequestData;
  transactions?: TransactionData[];
  sponsored?: boolean;
  chain?: Chain;  // Chain info with RPC and paymaster URLs
  apiKey?: string;
  onSuccess?: (result: TransactionResult) => void;
  onError?: (error: Error, errorCode?: number) => void;
}

export const TransactionModal = ({
  transactionRequest,
  transactions,
  sponsored = false,
  chain,
  apiKey,
  onSuccess,
  onError
}: TransactionModalProps) => {
  const { getAccount } = usePasskeys();
  const { walletAddress } = useAuth();
  const [gasFee, setGasFee] = useState<string>('');
  const [gasFeeLoading, setGasFeeLoading] = useState<boolean>(false);
  const [gasEstimationError, setGasEstimationError] = useState<string>('');
  const [transactionStatus, setTransactionStatus] = useState<string>('');
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [account, setAccount] = useState<Account | null>(null);
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Fee token state for ERC-20 paymaster
  const [feeTokens, setFeeTokens] = useState<FeeTokenOption[]>([]);
  const [feeTokensLoading, setFeeTokensLoading] = useState(false);
  const [selectedFeeToken, setSelectedFeeToken] = useState<FeeTokenOption | null>(null);

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

  // Determine if sponsored based on transactionRequest or prop
  const isSponsored = useMemo(() => {
    if (transactionRequest) {
      return !!transactionRequest.paymasterUrl;
    }
    return sponsored;
  }, [transactionRequest, sponsored]);

  // Normalize transaction data - prioritize transactionRequest, then fallback to legacy transactions prop
  const normalizedTransactions = useMemo((): TransactionData[] => {
    // Use transactionRequest if available
    if (transactionRequest) {
      return transactionRequest.transactions.map(tx => ({
        to: tx.to || '',
        data: tx.data || '0x',
        value: tx.value,
        chainId: tx.chainId
      }));
    }

    // Legacy way: use transactions prop
    if (transactions && transactions.length > 0) {
      return transactions;
    }

    return [];
  }, [transactionRequest, transactions]);

  const networkName = useMemo(() => {
    // Use chain prop if available, otherwise fall back to transaction chainId
    const chainId = chain?.id ?? normalizedTransactions[0]?.chainId;

    if (!chainId) return 'Ethereum';

    // Use the getChainNameFromId utility which has comprehensive chain mapping
    return getChainNameFromId(chainId);
  }, [normalizedTransactions, chain]);

  const chainIconKey = useMemo(() => {
    // Use chain prop if available, otherwise fall back to transaction chainId
    const chainId = chain?.id ?? normalizedTransactions[0]?.chainId;

    if (!chainId) return 'ethereum';

    // Use getChainIconKeyFromId to get the correct icon key format
    return getChainIconKeyFromId(chainId);
  }, [normalizedTransactions, chain]);

  const resetModalState = useCallback(() => {
    setGasFee('');
    setGasFeeLoading(false);
    setGasEstimationError('');
    setTransactionStatus('');
    setIsProcessing(false);
  }, []);

  useEffect(() => {
    if (!chain) {
      resetModalState();
    }
  }, [chain, resetModalState]);

  // Extract paymasterUrl from capabilities (EIP-5792 paymasterService capability)
  // Priority: capabilities.paymasterService.url > chain.paymaster.url
  const effectivePaymasterUrl = useMemo(() => {
    if (transactionRequest?.paymasterUrl) {
      return transactionRequest.paymasterUrl;
    }
    return chain?.paymaster?.url;
  }, [transactionRequest?.paymasterUrl, chain?.paymaster?.url]);

  // Extract paymasterContext from capabilities (EIP-5792 paymasterService.context)
  // Priority: capabilities.paymasterService.context > chain.paymaster.context
  const effectivePaymasterContext = useMemo(() => {
    if (transactionRequest?.paymasterContext) {
      return transactionRequest.paymasterContext;
    }
    return chain?.paymaster?.context;
  }, [transactionRequest?.paymasterContext, chain?.paymaster?.context]);

  // Track if user is paying with ERC-20 token (not native ETH, not sponsored)
  const isPayingWithErc20 = !isSponsored && !!selectedFeeToken && !selectedFeeToken.isNative;

  // Compute paymaster URL based on fee token selection (for ERC-20 paymaster)
  const computedPaymasterUrl = useMemo(() => {
    // If already sponsored via capabilities or config, use that
    if (effectivePaymasterUrl) return effectivePaymasterUrl;

    // If user selected an ERC-20 token (non-native), use ERC-20 paymaster
    if (selectedFeeToken && !selectedFeeToken.isNative) {
      return `${JAW_PAYMASTER_URL}?chainId=${chain?.id}${effectiveApiKey ? `&api-key=${effectiveApiKey}` : ''}`;
    }

    // Native ETH - no paymaster needed
    return undefined;
  }, [effectivePaymasterUrl, selectedFeeToken, chain?.id, effectiveApiKey]);

  // Compute paymaster context based on fee token selection
  const computedPaymasterContext = useMemo(() => {
    // If using ERC-20 paymaster, include token address in context
    if (selectedFeeToken && !selectedFeeToken.isNative) {
      return { token: selectedFeeToken.address };
    }
    return effectivePaymasterContext;
  }, [selectedFeeToken, effectivePaymasterContext]);

  // Determine if fee token selector should be shown
  const showFeeTokenSelector = !isSponsored && feeTokens.some(t => !t.isNative);

  // Fetch fee tokens when not sponsored (for ERC-20 paymaster option)
  useEffect(() => {
    // Skip if already sponsored via capabilities or config
    if (effectivePaymasterUrl || !chain || !walletAddress) return;

    let isMounted = true;

    const fetchFeeTokensData = async () => {
      setFeeTokensLoading(true);
      try {
        // Fetch capabilities from JAW RPC
        const capabilities = await handleGetCapabilitiesRequest(
          { method: 'wallet_getCapabilities', params: [] },
          effectiveApiKey || '',
          true // showTestnets
        );

        const chainIdHex = `0x${chain.id.toString(16)}` as `0x${string}`;
        const feeTokenCap = capabilities?.[chainIdHex]?.feeToken as FeeTokenCapability | undefined;

        if (!feeTokenCap?.supported || !feeTokenCap?.tokens?.length) {
          if (isMounted) setFeeTokensLoading(false);
          return;
        }

        // Get RPC URL for balance fetching
        const rpcUrl = chain.rpcUrl || `https://eth.llamarpc.com`;

        // Fetch balances in parallel
        const tokensWithBalances = await Promise.all(
          feeTokenCap.tokens.map(async (token) => {
            try {
              const balance = await fetchTokenBalance(token.address, walletAddress, rpcUrl);
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
              } as FeeTokenOption;
            }
          })
        );

        if (isMounted) {
          setFeeTokens(tokensWithBalances);
          // Default selection: prefer native ETH if it has balance, otherwise first selectable ERC-20
          const nativeToken = tokensWithBalances.find(t => t.isNative);
          if (nativeToken && nativeToken.isSelectable) {
            setSelectedFeeToken(nativeToken);
          } else {
            // Find first selectable non-native token
            const firstSelectableErc20 = tokensWithBalances.find(t => !t.isNative && t.isSelectable);
            setSelectedFeeToken(firstSelectableErc20 || nativeToken || null);
          }
        }
      } catch (error) {
        console.warn('[TransactionModal] Failed to fetch fee tokens:', error);
      } finally {
        if (isMounted) setFeeTokensLoading(false);
      }
    };

    fetchFeeTokensData();

    return () => {
      isMounted = false;
    };
  }, [chain, effectiveApiKey, walletAddress, effectivePaymasterUrl]);

  // Initialize account when modal opens
  useEffect(() => {
    let isMounted = true;

    const initializeModal = async () => {
      if (chain) {
        try {
          setIsProcessing(false);
          console.log('🔐 Initializing transaction modal');

          // Merge paymasterUrl from capabilities or ERC-20 selection into chain before creating account
          const chainWithPaymaster = {
            ...chain,
            ...(computedPaymasterUrl && { paymaster: { url: computedPaymasterUrl } }),
          };

          const restoredAccount = await getAccount(chainWithPaymaster, effectiveApiKey);

          if (isMounted) {
            setAccount(restoredAccount);
          }
        } catch (error) {
          console.error("Error initializing account:", error);
          if (isMounted) {
            setTransactionStatus(`Error: ${error instanceof Error ? error.message : 'Initialization failed'}`);
            const errorObj = error instanceof Error ? error : new Error(String(error));
            // Check if user cancelled passkey prompt (NotAllowedError)
            const errorCode = error instanceof Error && error.name === 'NotAllowedError'
              ? standardErrorCodes.provider.userRejectedRequest
              : standardErrorCodes.rpc.internal;
            onError?.(errorObj, errorCode);
          }
        }
      } else {
        // Reset when chain is not provided
        setAccount(null);
        setTransactionStatus('');
        setIsProcessing(false);
        setGasFee('');
        setGasEstimationError('');
        setFeeTokens([]);
        setSelectedFeeToken(null);
      }
    };

    initializeModal();

    return () => {
      isMounted = false;
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }
    };
  }, [chain, effectiveApiKey, computedPaymasterUrl, getAccount, onError]);

  // Gas estimation using Account class
  useEffect(() => {
    if (!account || !chain || normalizedTransactions.length === 0) return;

    const estimateGas = async () => {
      try {
        setGasFeeLoading(true);

        // Skip gas estimation if truly sponsored (not ERC-20 payment)
        if (isSponsored) {
          setGasFee('sponsored');
          setGasEstimationError('');
          return;
        }

        // Skip estimation for ERC-20 payment (paymaster handles it)
        if (isPayingWithErc20) {
          setGasFee('');
          setGasEstimationError('');
          return;
        }

        // Convert normalized transactions to TransactionCall format
        const transactionCalls: TransactionCall[] = normalizedTransactions.map(tx => ({
          to: tx.to as Address,
          value: tx.value ? BigInt(tx.value) : undefined, // Convert string wei to bigint
          data: (tx.data as `0x${string}`) || '0x'
        }));

        // Get permissionId from transactionRequest if available
        const permissionId = transactionRequest?.permissionId;

        // Estimate gas using Account class (with permission if provided)
        const gasPrice = await account.calculateGasCost(
          transactionCalls,
          permissionId ? { permissionId } : undefined
        );
        setGasFee(gasPrice);
        setGasEstimationError('');
      } catch (error) {
        console.error("Error estimating gas:", error);

        if (error instanceof Error && (error.message.includes('AA21') || error.message.includes("didn't pay prefund"))) {
          if (isSponsored) {
            setGasFee('sponsored');
            setGasEstimationError('');
          } else if (isPayingWithErc20) {
            // ERC-20 payment - no ETH estimation needed
            setGasFee('');
            setGasEstimationError('');
          } else {
            setGasFee('');
            setGasEstimationError('Insufficient funds');
          }
        } else {
          setGasFee('');
          setGasEstimationError('Failed to estimate gas');
        }
      } finally {
        setGasFeeLoading(false);
      }
    };

    estimateGas();
  }, [account, chain, normalizedTransactions, isSponsored, isPayingWithErc20, selectedFeeToken, transactionRequest?.permissionId]);

  const handleConfirm = useCallback(async () => {
    try {
      setIsProcessing(true);
      setTransactionStatus('Preparing transaction...');

      if (!account) {
        throw new Error('Account not initialized. Please try again.');
      }

      if (!chain) {
        throw new Error('Chain information is required.');
      }

      setTransactionStatus('Sending transaction...');

      // Convert normalized transactions to TransactionCall format
      const transactionCalls: TransactionCall[] = normalizedTransactions.map(tx => ({
        to: tx.to as Address,
        value: tx.value ? BigInt(tx.value) : undefined, // Convert string wei to bigint
        data: (tx.data as `0x${string}`) || '0x'
      }));

      // Send transaction using Account class
      // Pass computed paymaster URL and context (includes ERC-20 paymaster if selected)
      let result: TransactionResult;
      // Use sendCalls for wallet_sendCalls, sendTransaction for eth_sendTransaction
      if (transactionRequest?.method === 'wallet_sendCalls') {
        // Build options with permissionId if available
        const options = transactionRequest?.permissionId
          ? { permissionId: transactionRequest.permissionId }
          : undefined;

        const bundledResult = await account.sendCalls(
          transactionCalls,
          options,
          computedPaymasterUrl,
          computedPaymasterContext
        );
        // Return the transaction result with proper format based on method
        result = {
          id: bundledResult.id,
          chainId: bundledResult.chainId,
        };
      } else {
        const txHash = await account.sendTransaction(
          transactionCalls,
          computedPaymasterUrl,
          computedPaymasterContext
        );
        result = {
          hash: txHash,
        };
      }

      setTransactionStatus('Transaction confirmed!');

      // Call onSuccess immediately - parent will handle closing
      onSuccess?.(result);

    } catch (error) {
      console.error("Error in transaction:", error);
      const errorMessage = error instanceof Error ? error.message : String(error);
      setTransactionStatus(`Error: ${errorMessage}`);
      const errorObj = error instanceof Error ? error : new Error(errorMessage);
      // Determine error code based on error type
      let errorCode: number;
      if (error instanceof Error && error.name === 'NotAllowedError') {
        // User cancelled passkey prompt
        errorCode = standardErrorCodes.provider.userRejectedRequest;
      } else if (error instanceof Error && (
        errorMessage.includes('AA21') ||
        errorMessage.includes("didn't pay prefund") ||
        errorMessage.includes('insufficient') ||
        errorMessage.includes('exceeds balance')
      )) {
        // Transaction rejected due to funds/gas issues
        errorCode = standardErrorCodes.rpc.transactionRejected;
      } else {
        // Internal error
        errorCode = standardErrorCodes.rpc.internal;
      }
      onError?.(errorObj, errorCode);
      setIsProcessing(false);
    }
  }, [account, chain, normalizedTransactions, transactionRequest, computedPaymasterUrl, computedPaymasterContext, onSuccess, onError]);

  const handleCancel = useCallback(() => {
    if (!isProcessing) {
      setAccount(null);
      console.log('❌ User cancelled transaction request');
      // User rejected request (EIP-1193 code 4001)
      onError?.(new Error('User rejected the request'), standardErrorCodes.provider.userRejectedRequest);
      setTransactionStatus('');
      // Reset fee token state
      setFeeTokens([]);
      setSelectedFeeToken(null);
    }
  }, [isProcessing, onError]);

  return (
    <TransactionDialog
      // open={open}
      // onOpenChange={handleCancel}
      open={true}
      onOpenChange={() => { console.log('onOpenChange') }}
      transactions={normalizedTransactions}
      walletAddress={walletAddress ?? ''}
      gasFee={gasFee}
      gasFeeLoading={gasFeeLoading}
      gasEstimationError={gasEstimationError}
      sponsored={isSponsored}
      ethPrice={0}
      onConfirm={handleConfirm}
      onCancel={handleCancel}
      isProcessing={isProcessing}
      transactionStatus={transactionStatus}
      networkName={networkName ?? 'Ethereum'}
      chainIconKey={chainIconKey}
      // Fee token props for ERC-20 paymaster
      feeTokens={feeTokens}
      feeTokensLoading={feeTokensLoading}
      selectedFeeToken={selectedFeeToken}
      onFeeTokenSelect={setSelectedFeeToken}
      showFeeTokenSelector={showFeeTokenSelector}
      isPayingWithErc20={isPayingWithErc20}
    />
  );
}