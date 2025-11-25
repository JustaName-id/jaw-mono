import { ReactElement } from 'react';

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
  chainIcon?: ReactElement;
  chainIconKey?: string;

  // Actions
  onConfirm: () => void;
  onCancel: () => void;

  // Status
  isProcessing: boolean;
  status?: string;
  isLoadingTokenInfo?: boolean;

  // Timestamp
  timestamp?: Date;
}