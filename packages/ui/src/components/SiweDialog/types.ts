import { JSX } from "react";
export interface SiweDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;

  // Message data
  message: string;
  origin: string;
  timestamp: Date;

  // App information
  appName: string;
  appLogoUrl?: string;

  accountAddress?: string;
  chainName?: string;
  chainId?: number;
  chainIcon?: JSX.Element;

  // Actions
  onSign: () => Promise<void>;
  onCancel: () => void;

  // Status
  isProcessing: boolean;
  siweStatus: string;
  canSign: boolean;

  // Security warning for origin mismatch
  warningMessage?: string;

  // RPC configuration
  mainnetRpcUrl: string;
}
