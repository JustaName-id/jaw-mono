import { JSX } from "react";
export interface SignatureDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;

  // Message data
  message: string;
  origin: string;
  timestamp: Date;

  accountAddress?: string;
  chainName?: string;
  chainId?: number;
  chainIcon?: JSX.Element;

  // Actions
  onSign: () => Promise<void>;
  onCancel: () => void;

  // Status
  isProcessing: boolean;
  signatureStatus: string;
  canSign: boolean;
}
