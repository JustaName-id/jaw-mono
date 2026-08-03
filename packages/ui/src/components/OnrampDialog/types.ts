import type { OnrampOrder, OnrampParams } from '@jaw.id/core';

export interface OnrampDialogProps {
  open?: boolean;
  apiKey: string;
  /** Connected smart-account address funds are delivered to. */
  destinationAddress: string;
  /** Mainnet RPC URL for reverse ENS resolution of the destination (name@chain). */
  mainnetRpcUrl?: string;
  /** Optional dApp presets; the user edits amount + fills contact in the modal. */
  presets?: OnrampParams;
  /** Resolves the dApp request with the resulting order. */
  onComplete: (order: OnrampOrder) => void;
  /** User dismissed/cancelled before completion. */
  onCancel: () => void;
  /** A terminal provider error occurred. */
  onError: (error: Error) => void;
}
