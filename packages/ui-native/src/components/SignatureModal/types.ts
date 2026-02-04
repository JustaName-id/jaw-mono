import { ReactElement } from 'react';

export interface SignatureModalProps {
  open: boolean;
  onOpenChange?: (open: boolean) => void;
  message: string;
  origin: string;
  timestamp: Date;
  accountAddress?: string;
  chainName?: string;
  chainId?: number;
  chainIcon?: ReactElement;
  onSign: () => Promise<void> | void;
  onCancel: () => void;
  isProcessing: boolean;
  signatureStatus?: string;
  canSign?: boolean;
}

export interface SiweModalProps extends SignatureModalProps {
  appName?: string;
  appLogoUrl?: string;
}

export interface Eip712ModalProps {
  open: boolean;
  onOpenChange?: (open: boolean) => void;
  typedData: string;
  origin: string;
  timestamp: Date;
  accountAddress?: string;
  chainName?: string;
  chainId?: number;
  chainIcon?: ReactElement;
  onSign: () => Promise<void> | void;
  onCancel: () => void;
  isProcessing: boolean;
  signatureStatus?: string;
}
