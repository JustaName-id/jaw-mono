import { JSX } from 'react';
export interface SignatureDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;

  // Message data
  message: string;
  origin: string;

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
  /** Briefly true after a successful sign so the dialog can play a success tick before closing. */
  isSuccess?: boolean;
  signatureStatus: string;
  canSign: boolean;
}
