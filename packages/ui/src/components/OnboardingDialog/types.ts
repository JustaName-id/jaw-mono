import type { SubnameTextRecordCapabilityRequest } from "@jaw.id/core";

export interface LocalStorageAccount {
  username: string;
  creationDate: Date;
  credentialId?: string;
  isImported?: boolean;
}

/**
 * Data returned from account creation, passed through to completion handler.
 * This allows data to flow naturally through callbacks without intermediate state.
 */
export interface CreatedAccountData {
  address: string;
  credentialId: string;
  username: string;
  publicKey: `0x${string}`;
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
  onCreateAccount: (username: string) => Promise<CreatedAccountData>;
  onAccountCreationComplete: (account: CreatedAccountData) => Promise<void>;
  isCreating: boolean;

  // Configuration
  ensDomain?: string;
  chainId?: number;
  mainnetRpcUrl: string;
  apiKey?: string; // API key for JustaName API authentication (xApiKey header)
  supportedChains?: Array<{ id: number }>;
  subnameTextRecords?: SubnameTextRecordCapabilityRequest;
}
