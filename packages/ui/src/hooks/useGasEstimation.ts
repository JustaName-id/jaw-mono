import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import type { Address, Hex } from 'viem';
import type { Account, TokenEstimate, TransactionCall } from '@jaw.id/core';
import { estimateErc20PaymasterCosts, JAW_PAYMASTER_URL } from '@jaw.id/core';
import type { FeeTokenOption } from '../components/FeeTokenSelector';

// ============================================================================
// Types
// ============================================================================

// Re-export TransactionCall from core for consumers
export type { TransactionCall } from '@jaw.id/core';

/**
 * Configuration options for gas estimation
 */
export interface UseGasEstimationConfig {
  /** The Account instance to estimate gas for */
  account: Account | null;
  /** Array of transaction calls to estimate */
  transactionCalls: TransactionCall[];
  /** Chain ID for the estimation */
  chainId: number;
  /** API key for paymaster access */
  apiKey?: string;
  /** Available fee tokens (ETH + ERC-20) */
  feeTokens: FeeTokenOption[];
  /** Whether the transaction is sponsored (gas covered by paymaster) */
  isSponsored?: boolean;
  /** Optional permission ID for permission-based execution */
  permissionId?: Hex;
  /** Override account address — estimate gas for a different account this passkey owns */
  address?: Address;
  /** Callback when fee tokens are updated with estimates */
  onFeeTokensUpdate?: (tokens: FeeTokenOption[]) => void;
}

/**
 * Result returned by the useGasEstimation hook
 */
export interface UseGasEstimationResult {
  /** Expected gas fee in ETH (from bundler simulation) — likely actual cost. Empty string if unavailable. */
  gasFee: string;
  /** Max fee in ETH (prefund) — the balance requirement and ceiling. Or 'sponsored'. */
  maxFee: string;
  /** Gas price in wei (for details). */
  gasPriceWei: string;
  /** Padded gas units (for details). */
  gasUnits: string;
  /** Whether gas estimation is in progress */
  gasFeeLoading: boolean;
  /** Error message if estimation failed */
  gasEstimationError: string;
  /** Token cost estimates for ERC-20 payment options */
  tokenEstimates: TokenEstimate[];
  /** Whether ERC-20 token cost estimation is in progress */
  estimatingTokenCosts: boolean;
  /** Currently selected fee token */
  selectedFeeToken: FeeTokenOption | null;
  /** Function to manually select a fee token */
  setSelectedFeeToken: (token: FeeTokenOption | null) => void;
  /** Whether user is paying with ERC-20 (not ETH, not sponsored) */
  isPayingWithErc20: boolean;
  /** Re-estimate gas (useful after transaction changes) */
  refetch: () => void;
}

// ============================================================================
// Constants
// ============================================================================

/** Fallback gas estimate in ETH for L2 chains when ETH estimation fails */
const FALLBACK_GAS_ESTIMATE_ETH = '0.00005';

/** Error messages that indicate insufficient funds */
const INSUFFICIENT_FUNDS_ERRORS = [
  'AA21',
  "didn't pay prefund",
  'insufficient',
  'AA50', // PostOp reverted (e.g., paymaster insufficient balance)
  'paymasterValidationGasLimit is required', // ERC-20 paymaster can't validate with 0 balance
];

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Check if an error indicates insufficient funds
 */
function isInsufficientFundsError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  return INSUFFICIENT_FUNDS_ERRORS.some((msg) => error.message.toLowerCase().includes(msg.toLowerCase()));
}

/**
 * Build paymaster URL with chain ID and API key
 */
function buildPaymasterUrl(chainId: number, apiKey?: string): string {
  const baseUrl = `${JAW_PAYMASTER_URL}?chainId=${chainId}`;
  return apiKey ? `${baseUrl}&api-key=${apiKey}` : baseUrl;
}

// ============================================================================
// Hook Implementation
// ============================================================================

/**
 * Hook for estimating gas costs in both ETH and ERC-20 tokens.
 *
 * Features:
 * - Parallel estimation of ETH and ERC-20 costs using Promise.allSettled
 * - Automatic fallback to ERC-20 when ETH balance is insufficient
 * - Smart token selection based on available balances
 * - Loading states for smooth UI transitions
 *
 * @example
 * ```tsx
 * const {
 *   gasFee,
 *   gasFeeLoading,
 *   selectedFeeToken,
 *   setSelectedFeeToken,
 *   isPayingWithErc20,
 * } = useGasEstimation({
 *   account,
 *   transactionCalls,
 *   chainId: 84532,
 *   apiKey: 'your-api-key',
 *   feeTokens,
 *   onFeeTokensUpdate: setFeeTokens,
 * });
 * ```
 */
export function useGasEstimation({
  account,
  transactionCalls,
  chainId,
  apiKey,
  feeTokens,
  isSponsored = false,
  permissionId,
  address,
  onFeeTokensUpdate,
}: UseGasEstimationConfig): UseGasEstimationResult {
  // -------------------------------------------------------------------------
  // State
  // -------------------------------------------------------------------------

  const [gasFee, setGasFee] = useState<string>('');
  const [maxFee, setMaxFee] = useState<string>('');
  const [gasPriceWei, setGasPriceWei] = useState<string>('');
  const [gasUnits, setGasUnits] = useState<string>('');
  const [gasFeeLoading, setGasFeeLoading] = useState<boolean>(true);
  const [gasEstimationError, setGasEstimationError] = useState<string>('');
  const [tokenEstimates, setTokenEstimates] = useState<TokenEstimate[]>([]);
  const [estimatingTokenCosts, setEstimatingTokenCosts] = useState<boolean>(false);
  const [selectedFeeToken, setSelectedFeeToken] = useState<FeeTokenOption | null>(null);

  // Track estimation version to handle race conditions
  const estimationVersionRef = useRef<number>(0);

  // Use refs for values that shouldn't trigger re-estimation
  const feeTokensRef = useRef(feeTokens);
  feeTokensRef.current = feeTokens;

  const onFeeTokensUpdateRef = useRef(onFeeTokensUpdate);
  onFeeTokensUpdateRef.current = onFeeTokensUpdate;

  // Track ERC-20 token addresses to re-run estimation when new tokens are added
  // This is stable when only gasCostFormatted/isSelectable change (preventing infinite loops)
  const erc20TokenAddresses = useMemo(
    () =>
      feeTokens
        .filter((t) => !t.isNative)
        .map((t) => t.address.toLowerCase())
        .sort()
        .join(','),
    [feeTokens]
  );

  // -------------------------------------------------------------------------
  // Derived State
  // -------------------------------------------------------------------------

  const isPayingWithErc20 = !isSponsored && !!selectedFeeToken && !selectedFeeToken.isNative;

  // -------------------------------------------------------------------------
  // Sync selected token when feeTokens update
  // -------------------------------------------------------------------------

  useEffect(() => {
    if (!selectedFeeToken || selectedFeeToken.isNative) return;

    const updatedToken = feeTokens.find((t) => t.address.toLowerCase() === selectedFeeToken.address.toLowerCase());

    // Update if gasCostFormatted changed (new estimate came in)
    if (updatedToken && updatedToken.gasCostFormatted !== selectedFeeToken.gasCostFormatted) {
      setSelectedFeeToken(updatedToken);
    }
  }, [feeTokens, selectedFeeToken]);

  // -------------------------------------------------------------------------
  // Main Estimation Logic
  // -------------------------------------------------------------------------

  const estimateGas = useCallback(async () => {
    // Validation - keep loading state true while waiting for account
    if (!account) {
      // Don't set loading to false here - we're still waiting for prerequisites
      return;
    }

    // Handle sponsored transactions
    if (isSponsored) {
      setGasFee('sponsored');
      setMaxFee('sponsored');
      setGasFeeLoading(false);
      setGasEstimationError('');
      return;
    }

    // Handle empty transactionCalls (e.g., for permission grants)
    // Use a fallback gas estimate and still run ERC-20 estimation with a dummy call
    // Using zero address as dummy target for estimation purposes
    const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000' as Address;
    const effectiveCalls = transactionCalls.length > 0 ? transactionCalls : [{ to: ZERO_ADDRESS, value: 0n }]; // Dummy call for estimation

    // Increment version to track this estimation
    const currentVersion = ++estimationVersionRef.current;

    // Start loading
    setGasFeeLoading(true);
    setEstimatingTokenCosts(true);
    setGasEstimationError('');

    try {
      // Use refs to avoid infinite loops (these values shouldn't trigger re-estimation)
      const currentFeeTokens = feeTokensRef.current;
      const erc20Tokens = currentFeeTokens.filter((t) => !t.isNative);
      // Filter tokens with balance > 0 for estimation (paymaster can't validate with 0 balance)
      const erc20TokensWithBalance = erc20Tokens.filter((t) => t.balance > 0n);
      const paymasterUrl = buildPaymasterUrl(chainId, apiKey);

      // Convert effectiveCalls to ensure value is bigint for estimateErc20PaymasterCosts
      const callsWithBigIntValue = effectiveCalls.map((call) => ({
        to: call.to as Address,
        value:
          call.value !== undefined ? (typeof call.value === 'string' ? BigInt(call.value) : call.value) : undefined,
        data: call.data as Hex | undefined,
      }));

      // Resolve the correct smart account for estimation (handles address override)
      const resolvedSmartAccount = await account.getSmartAccountFor(address);

      // Run ETH and ERC-20 estimation in parallel
      const [ethResult, erc20Result] = await Promise.allSettled([
        // ETH gas estimation
        account.calculateGasCost(effectiveCalls, permissionId || address ? { permissionId, address } : undefined),
        // ERC-20 gas estimation (only for tokens with balance > 0)
        // Tokens with 0 balance will be marked as not selectable below
        erc20TokensWithBalance.length > 0
          ? estimateErc20PaymasterCosts(
              resolvedSmartAccount,
              callsWithBigIntValue,
              account.getChain(),
              paymasterUrl,
              erc20TokensWithBalance.map((t) => ({
                address: t.address as Address,
                symbol: t.symbol,
                decimals: t.decimals,
                balance: t.balance,
              }))
            )
          : Promise.resolve([]),
      ]);

      // Check if this estimation is still current (handle race conditions)
      if (currentVersion !== estimationVersionRef.current) {
        return;
      }

      // Process ERC-20 results first (so we have updated feeTokens for decision making)
      let updatedFeeTokens = [...currentFeeTokens];
      let erc20Estimates: TokenEstimate[] = [];

      if (erc20Result.status === 'fulfilled') {
        erc20Estimates = erc20Result.value;
        console.log('[useGasEstimation] ERC-20 token estimates:', erc20Estimates);
        setTokenEstimates(erc20Estimates);

        // Update feeTokens with the estimated costs and selectability
        updatedFeeTokens = currentFeeTokens.map((token) => {
          if (token.isNative) return token;

          // Tokens with 0 balance are not selectable (can't pay gas fees)
          if (token.balance === 0n) {
            return {
              ...token,
              gasCostFormatted: undefined, // No estimate available
              isSelectable: false,
            };
          }

          const estimate = erc20Estimates.find((e) => e.tokenAddress.toLowerCase() === token.address.toLowerCase());

          if (estimate) {
            return {
              ...token,
              gasCostFormatted: estimate.tokenCostFormatted,
              isSelectable: estimate.hasSufficientBalance,
            };
          }
          return token;
        });

        // Notify parent of updated tokens (use ref to avoid infinite loop)
        onFeeTokensUpdateRef.current?.(updatedFeeTokens);
      } else if (erc20Result.status === 'rejected') {
        // Check if this is an insufficient balance error (expected case, not a real error)
        const isInsufficientBalance = isInsufficientFundsError(erc20Result.reason);

        if (isInsufficientBalance) {
          // This is an expected case - user doesn't have enough ERC-20 tokens
          // Don't log as error, just mark tokens as insufficient
          updatedFeeTokens = currentFeeTokens.map((token) => {
            if (token.isNative) return token;

            // Tokens with 0 balance are not selectable
            if (token.balance === 0n) {
              return {
                ...token,
                gasCostFormatted: undefined,
                isSelectable: false,
              };
            }

            // Try to extract the required amount from the error message
            // Format: "X.XXX USDC required but sender has Y USDC"
            let gasCostFormatted = 'Insufficient';
            const errorMsg = erc20Result.reason instanceof Error ? erc20Result.reason.message : '';
            const match = errorMsg.match(/([\d.]+)\s*(\w+)\s*required/i);
            if (match) {
              gasCostFormatted = match[1]; // Just the amount, symbol is already shown
            }

            return {
              ...token,
              gasCostFormatted,
              isSelectable: false,
            };
          });
        } else {
          // Unexpected error - log it and show estimation failed
          console.error('[useGasEstimation] ERC-20 estimation failed:', erc20Result.reason);
          updatedFeeTokens = currentFeeTokens.map((token) => {
            if (token.isNative) return token;

            // Tokens with 0 balance - just mark as not selectable without error message
            if (token.balance === 0n) {
              return {
                ...token,
                gasCostFormatted: undefined,
                isSelectable: false,
              };
            }

            return {
              ...token,
              gasCostFormatted: 'Estimation failed',
              isSelectable: false,
            };
          });
        }
        onFeeTokensUpdateRef.current?.(updatedFeeTokens);
      }

      // Process ETH result
      const ethSuccess = ethResult.status === 'fulfilled';
      const ethInsufficientFunds = ethResult.status === 'rejected' && isInsufficientFundsError(ethResult.reason);

      if (ethSuccess) {
        console.log('[useGasEstimation] ETH gas estimation result:', ethResult.value);
        handleEthSuccess(ethResult.value, updatedFeeTokens);
      } else if (ethInsufficientFunds) {
        handleEthInsufficientFunds(updatedFeeTokens);
      } else {
        handleEstimationError(ethResult.status === 'rejected' ? ethResult.reason : null);
      }
    } catch (error) {
      // Check if this estimation is still current
      if (currentVersion !== estimationVersionRef.current) {
        return;
      }
      handleEstimationError(error);
    } finally {
      // Only update loading states if this is still the current estimation
      if (currentVersion === estimationVersionRef.current) {
        setGasFeeLoading(false);
        setEstimatingTokenCosts(false);
      }
    }
    // Note: feeTokens and onFeeTokensUpdate accessed via refs to prevent infinite loops
    // erc20TokenAddresses triggers re-estimation when new ERC-20 tokens are added (but not when estimates update)
  }, [account, transactionCalls, chainId, apiKey, isSponsored, permissionId, address, erc20TokenAddresses]);

  // -------------------------------------------------------------------------
  // Result Handlers
  // -------------------------------------------------------------------------

  /**
   * Handle successful ETH gas estimation
   */
  const handleEthSuccess = useCallback(
    (
      gasResult: {
        estimatedFee: string;
        maxFee: string;
        gasPriceWei: string;
        totalGasUnits: string;
      },
      updatedFeeTokens: FeeTokenOption[]
    ) => {
      // Prefer estimated (likely cost); fall back to maxFee (prefund) if bundler didn't provide it.
      setGasFee(gasResult.estimatedFee || gasResult.maxFee);
      setMaxFee(gasResult.maxFee);
      setGasPriceWei(gasResult.gasPriceWei);
      setGasUnits(gasResult.totalGasUnits);
      setGasEstimationError('');

      if (!selectedFeeToken) {
        const nativeToken = updatedFeeTokens.find((t) => t.isNative && t.isSelectable);
        if (nativeToken) {
          setSelectedFeeToken(nativeToken);
        }
      }
    },
    [selectedFeeToken]
  );

  /**
   * Handle ETH insufficient funds - try to fallback to ERC-20
   */
  const handleEthInsufficientFunds = useCallback((updatedFeeTokens: FeeTokenOption[]) => {
    const selectableErc20 = updatedFeeTokens.find((t) => !t.isNative && t.isSelectable);

    if (selectableErc20) {
      setSelectedFeeToken(selectableErc20);
      setGasFee(FALLBACK_GAS_ESTIMATE_ETH);
      setMaxFee(FALLBACK_GAS_ESTIMATE_ETH);
      setGasEstimationError('');
    } else {
      setGasFee('');
      setMaxFee('');
      setGasEstimationError('Insufficient funds');
    }
  }, []);

  /**
   * Handle estimation error (not insufficient funds)
   */
  const handleEstimationError = useCallback((error: unknown) => {
    console.error('[useGasEstimation] Error:', error);
    setGasFee('');
    setMaxFee('');
    setGasEstimationError('Failed to estimate gas');
  }, []);

  // -------------------------------------------------------------------------
  // Effects
  // -------------------------------------------------------------------------

  // Run estimation when dependencies change
  useEffect(() => {
    estimateGas();
  }, [estimateGas]);

  // -------------------------------------------------------------------------
  // Return
  // -------------------------------------------------------------------------

  return {
    gasFee,
    maxFee,
    gasPriceWei,
    gasUnits,
    gasFeeLoading,
    gasEstimationError,
    tokenEstimates,
    estimatingTokenCosts,
    selectedFeeToken,
    setSelectedFeeToken,
    isPayingWithErc20,
    refetch: estimateGas,
  };
}
