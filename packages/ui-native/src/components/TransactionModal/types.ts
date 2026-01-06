import { ReactElement } from 'react';

export interface TransactionData {
  to: string;
  value?: string;
  data?: string;
  from?: string;
}

export interface TransactionModalProps {
  open: boolean;
  onOpenChange?: (open: boolean) => void;
  transactions: TransactionData[];
  walletAddress: string;
  gasFee: string;
  gasFeeLoading: boolean;
  gasEstimationError?: string;
  sponsored: boolean;
  ethPrice?: number;
  onConfirm: () => Promise<void> | void;
  onCancel: () => void;
  isProcessing: boolean;
  transactionStatus?: string;
  networkName: string;
  chainId?: number;
  chainIcon?: ReactElement;
}
