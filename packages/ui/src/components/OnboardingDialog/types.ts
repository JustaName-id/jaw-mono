export interface LocalStorageAccount {
  username: string;
  creationDate: Date;
  credentialId?: string;
  isImported?: boolean;
}

export interface UsernameValidation {
  isValid: boolean;
  isLoading: boolean;
  message: string;
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
  username: string;
  onUsernameChange: (username: string) => void;
  onCreateAccount: () => void;
  isCreating: boolean;

  // Validation
  usernameValidation: UsernameValidation;

  // Configuration
  ensDomain: string;
}
