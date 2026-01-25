import { ReactElement } from 'react';
import { FeeTokenOption } from '../FeeTokenSelector';

export interface SpendPermission {
  amount: string;
  amountUsd?: string;
  token: string;
  tokenAddress: string;
  duration: string;
  limit: string;
}

export interface CallPermission {
  target: string;
  selector: string;
  functionSignature: string;
}

export interface PermissionDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;

  // Mode: grant for new permissions, revoke for existing
  mode: 'grant' | 'revoke';

  // Permission details
  permissionId?: string; // Only for revoke mode
  spenderAddress: string;
  origin: string; // Requesting dApp origin

  // Arrays of permissions
  spends?: SpendPermission[];
  calls?: CallPermission[];

  // Period and expiry
  expiryDate: string; // Formatted expiry date

  // Network info
  networkName: string;
  chainId?: number;
  chainIcon?: ReactElement;
  apiKey?: string;

  // Actions
  onConfirm: () => void;
  onCancel: () => void;

  // Status
  isProcessing: boolean;
  status?: string;
  isLoadingTokenInfo?: boolean;

  // Timestamp
  timestamp?: Date;

  // Custom warning message for grant mode
  warningMessage?: string;

  // Gas estimation props
  gasFee?: string;
  gasFeeLoading?: boolean;
  gasEstimationError?: string;
  sponsored?: boolean;

  // Fee token selection (for ERC-20 paymaster)
  feeTokens?: FeeTokenOption[];
  feeTokensLoading?: boolean;
  selectedFeeToken?: FeeTokenOption | null;
  onFeeTokenSelect?: (token: FeeTokenOption) => void;
  showFeeTokenSelector?: boolean;

  // ERC-20 payment indicator (when user selected non-native token)
  isPayingWithErc20?: boolean;

  // RPC configuration
  mainnetRpcUrl: string;
}