import type { OnrampOrder, AddFundsParams } from '@jaw.id/core';

/** A network the user may receive on / (maybe) buy on. */
export interface AddFundsChain {
  id: number;
  name: string;
}

export interface AddFundsDialogProps {
  open?: boolean;
  apiKey: string;
  /** Connected smart-account address funds are delivered to / received at. */
  destinationAddress: string;
  /** Mainnet RPC URL for reverse ENS resolution of the destination (name@chain). */
  mainnetRpcUrl?: string;
  /** Allowed networks (resolved from the dApp's chains ∩ SUPPORTED_CHAINS). */
  chains: AddFundsChain[];
  /** Chain id to preselect (the connected chain); falls back to the first allowed. */
  defaultChainId?: number;
  /** Whether the Buy (Coinbase onramp) section is available — CrossPlatform only. */
  canBuy?: boolean;
  /** Optional dApp presets for the Buy section. */
  presets?: AddFundsParams;
  /** Resolves the dApp request with the resulting order (only when the user buys). */
  onComplete: (order: OnrampOrder) => void;
  /** User closed the screen (received via QR, or dismissed) — resolves null, not a rejection. */
  onCancel: () => void;
  /** A terminal provider error occurred during a buy. */
  onError: (error: Error) => void;
}
