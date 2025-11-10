import { ChainId } from "@justaname.id/sdk";

export interface LocalStorageAccount {
  username: string;
  creationDate: Date;
  credentialId?: string;
  isImported?: boolean;
}

export interface OnboardingDialogProps {
  // Account list section
  accounts: LocalStorageAccount[];
  onAccountSelect: (account: LocalStorageAccount) => Promise<void>;
  loggingInAccount: string | null;

  // Import existing account section
  onImportAccount: () => void;
  isImporting: boolean;

  // Create new account section
  onCreateAccount: (username: string) => Promise<string>;
  onAccountCreationComplete: () => Promise<void>;
  isCreating: boolean;

  // Configuration
  ensDomain?: string;
  chainId?: ChainId;
  apiKey?: string;
  supportedChains?: Array<{ id: number }>;
  subnameTextRecords?: Array<{ key: string; value: string }>;
}
