import { FeeTokenOption } from '../FeeTokenSelector';

export interface TransactionData {
  to: string;
  data?: string;
  value?: string;
  chainId: number;
  // To check if needed
  stepId?: string;
  description?: string;
  action?: string;
}

export interface TransactionDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;

  // Transaction data
  transactions: TransactionData[];

  // Wallet info
  walletAddress: string;

  // Gas estimation
  gasFee: string;
  gasFeeLoading: boolean;
  gasEstimationError: string;
  sponsored: boolean;
  ethPrice: number;

  // Actions
  onConfirm: () => Promise<void>;
  onCancel: () => void;
  isProcessing: boolean;

  // Status
  transactionStatus: string;

  // Display utilities
  networkName: string;
  chainIconKey?: string;

  // Fee token selection (for ERC-20 paymaster)
  feeTokens?: FeeTokenOption[];
  feeTokensLoading?: boolean;
  selectedFeeToken?: FeeTokenOption | null;
  onFeeTokenSelect?: (token: FeeTokenOption) => void;
  showFeeTokenSelector?: boolean;

  // ERC-20 payment indicator (when user selected non-native token)
  isPayingWithErc20?: boolean;
}
