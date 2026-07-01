'use client';

import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Spinner } from '../ui/spinner';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card';
import { WalletIcon } from '../../icons';
import { OrSeparator } from '../OrSeparator';
import { OnboardingDialogProps } from './types';
import { selectDefaultAccount } from './selectDefaultAccount';
import { useState, useEffect, useMemo } from 'react';
import { getJustaNameInstance } from '../../utils/justaNameInstance';
import { toCoinType } from 'viem';

// Props needed by the create form — the create-related subset of OnboardingDialogProps.
type CreateAccountFormProps = Pick<
  OnboardingDialogProps,
  | 'onCreateAccount'
  | 'onAccountCreationComplete'
  | 'isCreating'
  | 'ensDomain'
  | 'chainId'
  | 'mainnetRpcUrl'
  | 'apiKey'
  | 'supportedChains'
  | 'subnameTextRecords'
>;

/**
 * Username input + availability check + Create button + error display.
 * Shared between Layout B (inline) and the Layout A "Create Account" sub-view.
 * Logic is unchanged from the previous OnboardingDialog create section.
 */
function CreateAccountForm({
  onCreateAccount,
  onAccountCreationComplete,
  isCreating,
  ensDomain,
  chainId,
  mainnetRpcUrl,
  apiKey,
  supportedChains,
  subnameTextRecords,
}: CreateAccountFormProps) {
  const [isValid, setIsValid] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [username, setUsername] = useState('');
  const [debouncedUsername, setDebouncedUsername] = useState('');
  const [error, setError] = useState<string | null>(null);

  // Debounce username input
  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedUsername(username);
    }, 500);
    return () => clearTimeout(handler);
  }, [username]);

  // Validate username and check availability
  useEffect(() => {
    const validateUsername = async () => {
      setIsLoading(false);
      setIsValid(false);
      setMessage('');

      if (username.includes('.')) {
        setMessage('Invalid format');
        setIsValid(false);
        return;
      }

      if (username.length > 0 && username.length <= 2) {
        setMessage('Minimum 3 characters');
        setIsValid(false);
        return;
      }

      if (username.length === 0) {
        return;
      }

      if (!ensDomain) {
        setMessage('Available');
        setIsValid(true);
        return;
      }

      if (debouncedUsername.length > 2 && chainId) {
        setIsLoading(true);
        setMessage('Checking availability...');

        try {
          const justaName = getJustaNameInstance(mainnetRpcUrl);
          const result = await justaName.subnames.isSubnameAvailable({
            subname: debouncedUsername + '.' + ensDomain,
            chainId: 1, // ENS offchain subnames must always be issued on Ethereum mainnet (chainId 1)
          });

          if (result?.isAvailable) {
            setMessage('Available');
            setIsValid(true);
          } else {
            setMessage('Unavailable');
            setIsValid(false);
          }
        } catch (error) {
          console.error('Error checking subname availability:', error);
          setMessage('Error checking availability');
          setIsValid(false);
        } finally {
          setIsLoading(false);
        }
      }
    };

    validateUsername();
  }, [debouncedUsername, username, ensDomain, chainId, mainnetRpcUrl]);

  const handleCreateAccountClick = async () => {
    setError(null);

    try {
      const accountData = await onCreateAccount(username);

      if (ensDomain && chainId && apiKey && supportedChains && accountData.address) {
        try {
          const justaName = getJustaNameInstance(mainnetRpcUrl);

          const addresses = supportedChains.map((chain) => ({
            address: accountData.address,
            coinType: toCoinType(chain.id).toString(),
          }));

          // Use subnameTextRecords from capabilities if provided (only used during new account creation)
          // If not provided or empty, use empty array (no text records will be set)
          await justaName.subnames.addSubname(
            {
              username: username,
              ensDomain: ensDomain,
              chainId: 1, // ENS offchain subnames must always be issued on Ethereum mainnet (chainId 1)
              addresses: addresses,
              overrideSignatureCheck: true,
              text: subnameTextRecords && subnameTextRecords.length > 0 ? subnameTextRecords : [],
            },
            {
              xApiKey: apiKey,
              xAddress: accountData.address,
              xMessage: '',
            }
          );
        } catch (subnameError) {
          const errorMessage = `Failed to register subname: ${subnameError instanceof Error ? subnameError.message : 'Unknown error'}`;
          console.error('❌ SUBNAME ERROR:', errorMessage, subnameError);
          setError(errorMessage);
          return; // Don't complete if subname registration fails
        }
      }

      // Pass account data through to completion handler
      await onAccountCreationComplete(accountData);
    } catch (error) {
      const errorMessage = `Account creation failed: ${error instanceof Error ? error.message : 'Unknown error'}`;
      console.error('❌ ACCOUNT CREATION ERROR:', errorMessage, error);
      setError(errorMessage);
    }
  };

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-row items-center gap-2">
        <Input
          placeholder="Username"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          className="flex-1"
          // Prevent password-manager extensions (1Password, LastPass, Dashlane,
          // Bitwarden) from attaching their inline overlay to this field. Their
          // overlay covers the embedded iframe, which the clickjacking guard
          // (EnsureVisibility) then reads as occlusion and disables interaction.
          autoComplete="off"
          data-1p-ignore
          data-lpignore="true"
          data-form-type="other"
          data-bwignore
          right={ensDomain ? <span className="text-foreground text-sm font-bold">{`.${ensDomain}`}</span> : undefined}
        />
        {isCreating ? (
          <Spinner className="h-10 w-10" />
        ) : (
          <Button
            onClick={async () => {
              try {
                await handleCreateAccountClick();
              } catch (err) {
                console.error('❌ Button onClick caught error:', err);
              }
            }}
            disabled={!isValid || isLoading}
          >
            Create Account
          </Button>
        )}
      </div>
      {username.length > 0 && message && !error && (
        <div className="flex items-center justify-between px-1">
          <span
            className={`text-xs font-medium ${
              isLoading ? 'text-muted-foreground' : isValid ? 'text-success' : 'text-destructive'
            }`}
          >
            {message}
          </span>
        </div>
      )}
      {error && (
        <div className="bg-destructive/10 border-destructive/20 flex flex-col gap-2 overflow-hidden rounded-md border px-1 py-2">
          <span className="text-destructive break-all text-xs font-medium">{error}</span>
          <Button
            onClick={() => setError(null)}
            variant="ghost"
            className="text-destructive hover:text-destructive/80 hover:bg-destructive/10 h-6 text-xs"
          >
            Dismiss
          </Button>
        </div>
      )}
    </div>
  );
}

export function OnboardingDialog({
  accounts,
  onAccountSelect,
  loggingInAccount,
  onImportAccount,
  isImporting,
  onCreateAccount,
  onAccountCreationComplete,
  isCreating,
  ensDomain,
  chainId,
  mainnetRpcUrl,
  apiKey,
  supportedChains,
  subnameTextRecords,
  lastAuthenticatedCredentialId,
}: OnboardingDialogProps) {
  const defaultAccount = useMemo(
    () => selectDefaultAccount(accounts, lastAuthenticatedCredentialId),
    [accounts, lastAuthenticatedCredentialId]
  );

  const createForm = (
    <CreateAccountForm
      onCreateAccount={onCreateAccount}
      onAccountCreationComplete={onAccountCreationComplete}
      isCreating={isCreating}
      ensDomain={ensDomain}
      chainId={chainId}
      mainnetRpcUrl={mainnetRpcUrl}
      apiKey={apiKey}
      supportedChains={supportedChains}
      subnameTextRecords={subnameTextRecords}
    />
  );

  // Layout A — a last account exists: one-tap Continue + Switch Account, with the
  // create form inline below so a returning user can still spin up a new account.
  if (defaultAccount) {
    const isBusy = loggingInAccount !== null;
    return (
      <Card className="w-full max-w-md shadow-xl">
        <CardHeader className="flex flex-col gap-1">
          <CardTitle className="text-xl font-normal">Welcome back</CardTitle>
          <CardDescription className="text-xs font-medium">
            Continue with your last used account, switch to another, or create a new one.
          </CardDescription>
        </CardHeader>

        <CardContent className="flex flex-col gap-5">
          <div className="flex flex-col gap-1">
            <Button
              onClick={() => onAccountSelect(defaultAccount)}
              disabled={isBusy}
              className="flex h-12 w-full flex-row items-center justify-center gap-2"
            >
              {loggingInAccount === defaultAccount.username ? (
                <Spinner className="!h-5 !w-5" />
              ) : (
                <>
                  <WalletIcon className="!h-6 !w-6" stroke="currentColor" />
                  <span>{`Continue as ${defaultAccount.username || 'your account'}`}</span>
                </>
              )}
            </Button>
            <Button
              onClick={onImportAccount}
              variant="link"
              className="mx-auto h-auto p-1 text-xs font-medium"
              disabled={isImporting || isBusy}
            >
              {isImporting ? 'Opening Passkey...' : 'Switch account'}
            </Button>
          </div>

          <OrSeparator />

          <div className="flex flex-col gap-2">
            <span className="text-muted-foreground text-xs font-medium">Create a new account</span>
            {createForm}
          </div>
        </CardContent>
      </Card>
    );
  }

  // Layout B — no stored account: Sign In (OS passkey picker) + inline create
  return (
    <Card className="w-full max-w-md shadow-xl">
      <CardHeader className="flex flex-col gap-1">
        <CardTitle className="text-xl font-normal">Sign In</CardTitle>
        <CardDescription className="text-xs font-medium">
          Sign in with an existing account, or create a new one.
        </CardDescription>
      </CardHeader>

      <CardContent className="flex flex-col gap-5">
        <Button
          onClick={onImportAccount}
          variant="outline"
          className="flex h-10 w-full flex-row items-center gap-2"
          disabled={isImporting}
        >
          <WalletIcon className="!h-6 !w-6" stroke="currentColor" />
          <span>{isImporting ? 'Opening Passkey...' : 'Sign In'}</span>
        </Button>

        <OrSeparator />

        <div className="flex flex-col gap-2">
          <span className="text-muted-foreground text-xs font-medium">Create a new account</span>
          {createForm}
        </div>
      </CardContent>
    </Card>
  );
}

export * from './types';
