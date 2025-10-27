import { JSX } from 'react';

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
  getChainIcon: (chain: string, size?: number) => JSX.Element;
}
