import { JSX } from "react";

export interface ConnectDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;

  // App information
  appName: string;
  appLogoUrl?: string;
  origin: string;
  timestamp: Date;

  // User account information
  accountName?: string;
  walletAddress: string;
  supportedChains?: number[];

  // Chain information
  chainName?: string;
  chainId?: number;
  chainIcon?: JSX.Element;

  // Actions
  onConnect: () => Promise<void>;
  onCancel: () => void;

  // Status
  isProcessing: boolean;
}
