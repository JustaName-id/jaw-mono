export interface LocalStorageAccount {
  username: string;
  address: string;
  credentialId: string;
  isImported?: boolean;
}

export interface OnboardingModalProps {
  open: boolean;
  onOpenChange?: (open: boolean) => void;
  accounts: LocalStorageAccount[];
  onAccountSelect: (account: LocalStorageAccount) => Promise<void>;
  loggingInAccount: string | null;
  onImportAccount: () => void;
  isImporting: boolean;
  onCreateAccount: (username: string) => Promise<string>;
  onAccountCreationComplete: () => Promise<void>;
  isCreating: boolean;
  ensDomain?: string;
  chainId?: number;
  apiKey?: string;
}
