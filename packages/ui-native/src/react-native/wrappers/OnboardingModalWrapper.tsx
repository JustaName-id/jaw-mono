import React, { useState, useEffect } from 'react';
import { Account, type PasskeyAccount } from '@jaw.id/core';
import { OnboardingModal } from '../../components/OnboardingModal';
import { ConnectModal } from '../../components/ConnectModal';
import type { LocalStorageAccount } from '../../components/OnboardingModal/types';
import type { ConnectUIRequest, UIHandlerConfig } from '@jaw.id/core';
import { createCredentialAdapter, getCredentialAdapter } from '../../passkey';
import { getChainNameFromId, getChainIconKeyFromId } from '../utils';
import { useChainIcon } from '../../hooks';

interface OnboardingModalWrapperProps {
  request: ConnectUIRequest;
  config: UIHandlerConfig;
  onApprove: (data: unknown) => void;
  onReject: (error?: Error) => void;
}

export const OnboardingModalWrapper: React.FC<OnboardingModalWrapperProps> = ({
  request,
  config,
  onApprove,
  onReject,
}) => {
  const [accounts, setAccounts] = useState<LocalStorageAccount[]>([]);
  const [loggingInAccount, setLoggingInAccount] = useState<string | null>(null);
  const [isImporting, setIsImporting] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [showConfirmation, setShowConfirmation] = useState(false);
  const [connectedAccount, setConnectedAccount] = useState<Account | null>(null);
  const [connectedAccountName, setConnectedAccountName] = useState<string>('');

  const chainId = config.chainId || 1;
  const apiKey = config.apiKey;
  const chainName = getChainNameFromId(chainId);
  const chainIconKey = getChainIconKeyFromId(chainId);
  const chainIcon = useChainIcon(chainIconKey, 20);

  // RP ID for passkeys - use keys.jaw.id for production
  const rpId = 'keys.jaw.id';
  const rpName = 'JAW Wallet';

  // Load stored accounts on mount
  useEffect(() => {
    loadAccounts();
  }, [apiKey]);

  const loadAccounts = () => {
    try {
      const storedAccounts = Account.getStoredAccounts(apiKey);
      const mappedAccounts: LocalStorageAccount[] = storedAccounts.map((acc: PasskeyAccount & { address?: string }) => ({
        username: acc.username,
        address: acc.address || '',
        credentialId: acc.credentialId,
        isImported: acc.isImported,
      }));
      setAccounts(mappedAccounts);
    } catch (error) {
      console.error('Failed to load accounts:', error);
      setAccounts([]);
    }
  };

  const handleAccountSelect = async (account: LocalStorageAccount) => {
    setLoggingInAccount(account.username);
    try {
      const loadedAccount = await Account.get(
        { chainId, apiKey },
        account.credentialId,
        { getFn: getCredentialAdapter }
      );
      setConnectedAccount(loadedAccount);
      setConnectedAccountName(account.username);
      setShowConfirmation(true);
    } catch (error) {
      console.error('Failed to authenticate:', error);
      if (error instanceof Error && error.name === 'NotAllowedError') {
        // User cancelled - don't show error
        return;
      }
      throw error;
    } finally {
      setLoggingInAccount(null);
    }
  };

  const handleImportAccount = async () => {
    setIsImporting(true);
    try {
      const importedAccount = await Account.import(
        { chainId, apiKey },
        { getFn: getCredentialAdapter }
      );
      const metadata = importedAccount.getMetadata();
      setConnectedAccount(importedAccount);
      setConnectedAccountName(metadata?.username || 'Imported Account');
      setShowConfirmation(true);
      loadAccounts(); // Refresh accounts list
    } catch (error) {
      console.error('Failed to import account:', error);
      if (error instanceof Error && error.name === 'NotAllowedError') {
        // User cancelled
        return;
      }
      throw error;
    } finally {
      setIsImporting(false);
    }
  };

  const handleCreateAccount = async (username: string): Promise<string> => {
    setIsCreating(true);
    try {
      const newAccount = await Account.create(
        { chainId, apiKey },
        { username, rpId, rpName, createFn: createCredentialAdapter }
      );
      const address = await newAccount.getAddress();
      setConnectedAccount(newAccount);
      setConnectedAccountName(username);
      return address;
    } catch (error) {
      console.error('Failed to create account:', error);
      throw error;
    }
  };

  const handleAccountCreationComplete = async () => {
    setIsCreating(false);
    setShowConfirmation(true);
    loadAccounts();
  };

  const handleConfirmConnection = async () => {
    if (!connectedAccount) return;

    try {
      const address = await connectedAccount.getAddress();
      const metadata = connectedAccount.getMetadata();

      onApprove({
        address,
        username: metadata?.username || connectedAccountName,
        credentialId: metadata ? (connectedAccount as any)._passkeyAccount?.credentialId : undefined,
      });
    } catch (error) {
      console.error('Failed to confirm connection:', error);
      onReject(error instanceof Error ? error : new Error('Failed to confirm connection'));
    }
  };

  const handleCancelConnection = () => {
    setShowConfirmation(false);
    setConnectedAccount(null);
    setConnectedAccountName('');
  };

  const handleClose = (open: boolean) => {
    if (!open) {
      onReject(new Error('User rejected the request'));
    }
  };

  // Show confirmation modal after successful auth
  if (showConfirmation && connectedAccount) {
    return (
      <ConnectModal
        open={true}
        onOpenChange={() => handleCancelConnection()}
        appName={request.data.appName || 'Unknown App'}
        appLogo={request.data.appLogo}
        appOrigin={request.data.origin || ''}
        accountName={connectedAccountName}
        walletAddress={connectedAccount.getAddress ? '' : ''} // Will be set async
        chainName={chainName}
        chainIcon={chainIcon}
        timestamp={new Date()}
        onConnect={handleConfirmConnection}
        onCancel={handleCancelConnection}
        isConnecting={false}
      />
    );
  }

  // Show onboarding modal
  return (
    <OnboardingModal
      open={true}
      onOpenChange={handleClose}
      accounts={accounts}
      onAccountSelect={handleAccountSelect}
      loggingInAccount={loggingInAccount}
      onImportAccount={handleImportAccount}
      isImporting={isImporting}
      onCreateAccount={handleCreateAccount}
      onAccountCreationComplete={handleAccountCreationComplete}
      isCreating={isCreating}
      chainId={chainId}
      apiKey={apiKey}
    />
  );
};
