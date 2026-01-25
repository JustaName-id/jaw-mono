import { JSX } from "react";
export interface Eip712DialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;

  // EIP-712 typed data (JSON string)
  typedDataJson: string;
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

  // RPC configuration
  mainnetRpcUrl: string;
}
