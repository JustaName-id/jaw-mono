import { ReactElement } from 'react';

export interface PermissionDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;

  // Mode: grant for new permissions, revoke for existing
  mode: 'grant' | 'revoke';

  // Permission details
  permissionId?: string; // Only for revoke mode
  spenderAddress: string;
  origin: string; // Requesting dApp origin

  // Amount and token info
  amount: string; // Amount in ETH (formatted)
  amountUsd?: string; // USD equivalent
  token: string; // Token name (e.g., "Native Token (ETH)")
  tokenAddress?: string; // Token contract address (if ERC-20)

  // Period and expiry
  duration: string; // Human-readable duration (e.g., "1 Day, 24 hours")
  expiryDate: string; // Formatted expiry date
  limit: string; // Daily limit (e.g., "10 ETH")

  // Network info
  networkName: string;
  chainIcon?: ReactElement;
  chainIconKey?: string;

  // Actions
  onConfirm: () => Promise<void>;
  onCancel: () => void;

  // Status
  isProcessing: boolean;
  status?: string;
  isLoadingTokenInfo?: boolean;

  // Timestamp
  timestamp?: Date;
}
