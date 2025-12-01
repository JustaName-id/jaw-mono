import type { SubnameTextRecordCapabilityRequest } from "@jaw.id/core";

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
  chainId?: number;
  apiKey?: string;
  supportedChains?: Array<{ id: number }>;
  subnameTextRecords?: SubnameTextRecordCapabilityRequest;
}
