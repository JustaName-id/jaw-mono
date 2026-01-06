import { ReactElement } from 'react';

export interface ConnectModalProps {
  open: boolean;
  onOpenChange?: (open: boolean) => void;
  appName: string;
  appLogoUrl?: string;
  origin: string;
  timestamp: Date;
  accountName?: string;
  walletAddress: string;
  chainName?: string;
  chainId?: number;
  chainIcon?: ReactElement;
  onConnect: () => Promise<void> | void;
  onCancel: () => void;
  isProcessing: boolean;
}
