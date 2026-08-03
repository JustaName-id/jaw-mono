import { FeeTokenOption } from '../FeeTokenSelector';
import { AssetDelta } from '../../utils/assetPreview';
import { RevertCause } from '../../utils/transactionFailure';

export interface TransactionData {
  to: string;
  data?: string;
  value?: string;
  chainId: number;
  // To check if needed
  stepId?: string;
  description?: string;
  action?: string;
}

export interface TransactionDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;

  // Transaction data
  transactions: TransactionData[];

  // Wallet info
  walletAddress: string;

  // Gas estimation
  gasFee: string;
  gasFeeLoading: boolean;
  gasEstimationError: string;
  sponsored: boolean;

  // Asset preview (simulated balance changes)
  assetsOut?: AssetDelta[];
  assetsIn?: AssetDelta[];
  assetPreviewError?: boolean;
  assetPreviewWillRevert?: boolean;
  /** Why the simulation reverted, when known — lets a balance shortfall read as insufficient funds. */
  assetPreviewRevertCause?: RevertCause;

  // Actions
  onConfirm: () => Promise<void>;
  onCancel: () => void;
  isProcessing: boolean;

  // Status
  transactionStatus: string;

  // Display utilities
  networkName: string;
  apiKey?: string;

  /** Requesting dApp, shown as the flow target on the processing screen. */
  appName?: string;
  appLogoUrl?: string | null;

  // Fee token selection (for ERC-20 paymaster)
  feeTokens?: FeeTokenOption[];
  feeTokensLoading?: boolean;
  selectedFeeToken?: FeeTokenOption | null;
  onFeeTokenSelect?: (token: FeeTokenOption) => void;
  showFeeTokenSelector?: boolean;

  // ERC-20 payment indicator (when user selected non-native token)
  isPayingWithErc20?: boolean;

  // RPC configuration
  mainnetRpcUrl: string;

  // Native currency symbol for the chain (e.g., 'FLR' for Flare, 'ETH' for Ethereum)
  nativeCurrencySymbol?: string;
}
