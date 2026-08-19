import { JSX } from 'react';
export interface Eip712DialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;

  // EIP-712 typed data (JSON string)
  typedDataJson: string;
  origin: string;

  // Requesting dApp identity (matches ConnectDialog/SignatureDialog)
  appName?: string;
  appLogoUrl?: string | null;

  accountAddress?: string;
  chainName?: string;
  chainId?: number;
  chainIcon?: JSX.Element;

  // Actions
  onSign: () => Promise<void>;
  onCancel: () => void;

  // Status
  isProcessing: boolean;
  /** Briefly true after a successful sign so the dialog can play a success tick before closing. */
  isSuccess?: boolean;
  signatureStatus: string;
  canSign: boolean;

  // RPC configuration
  mainnetRpcUrl: string;
}
