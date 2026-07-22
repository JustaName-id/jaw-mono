import { JSX } from 'react';
export interface SignatureDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;

  // Message data
  message: string;
  origin: string;
  timestamp: Date;

  // Requesting dApp identity (matches ConnectDialog)
  appName?: string;
  appLogoUrl?: string | null;

  accountAddress?: string;
  chainName?: string;
  chainId?: number;
  chainIcon?: JSX.Element;

  // RPC configuration
  mainnetRpcUrl: string;

  // Actions
  onSign: () => Promise<void>;
  onCancel: () => void;

  // Status
  isProcessing: boolean;
  signatureStatus: string;
  canSign: boolean;
}
