'use client';

import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Spinner } from '../ui/spinner';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card';
import { ArrowRightLeft, Fingerprint } from 'lucide-react';
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
  | 'onAccountCreationError'
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
 */
function CreateAccountForm({
  onCreateAccount,
  onAccountCreationComplete,
  onAccountCreationError,
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
    setIsLoading(false);
    setIsValid(false);
    setMessage('');

    if (username.includes('.')) {
      setMessage('Invalid format');
      return;
    }

    if (username.length > 0 && username.length <= 2) {
      setMessage('Minimum 3 characters');
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

    // Only query once the debounce has settled on the current input — while it is
    // pending, debouncedUsername is stale and would fire un-debounced requests for
    // the previous value.
    if (debouncedUsername !== username || !chainId) {
      return;
    }

    let cancelled = false;
    setIsLoading(true);
    setMessage('Checking availability...');

    (async () => {
      try {
        const justaName = getJustaNameInstance(mainnetRpcUrl);
        const result = await justaName.subnames.isSubnameAvailable({
          subname: debouncedUsername + '.' + ensDomain,
          chainId: 1, // ENS offchain subnames must always be issued on Ethereum mainnet (chainId 1)
        });

        if (cancelled) return;
        if (result?.isAvailable) {
          setMessage('Available');
          setIsValid(true);
        } else {
          setMessage('Unavailable');
        }
      } catch (error) {
        if (cancelled) return;
        console.error('Error checking subname availability:', error);
        setMessage('Error checking availability');
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    })();

    // Superseded checks must not write state: without this, the last response to
    // resolve wins, even when it answers for an older username.
    return () => {
      cancelled = true;
    };
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
          onAccountCreationError?.(subnameError);
          return; // Don't complete if subname registration fails
        }
      }

      // Pass account data through to completion handler
      await onAccountCreationComplete(accountData);
    } catch (error) {
      const errorMessage = `Account creation failed: ${error instanceof Error ? error.message : 'Unknown error'}`;
      console.error('❌ ACCOUNT CREATION ERROR:', errorMessage, error);
      setError(errorMessage);
      onAccountCreationError?.(error);
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
  onAccountCreationError,
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
      onAccountCreationError={onAccountCreationError}
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
          <div className="flex flex-col gap-2">
            <Button
              onClick={() => onAccountSelect(defaultAccount)}
              disabled={isBusy || isImporting}
              className="flex h-12 w-full flex-row items-center justify-center gap-2"
            >
              {loggingInAccount === defaultAccount.username ? (
                <Spinner className="!h-5 !w-5" />
              ) : (
                <>
                  <Fingerprint className="!h-6 !w-6" />
                  <span className="flex min-w-0 flex-row items-center gap-1.5">
                    <span className="opacity-70">Continue as</span>
                    <span className="max-w-full truncate">{defaultAccount.username || 'your account'}</span>
                  </span>
                </>
              )}
            </Button>
            <Button
              onClick={onImportAccount}
              variant="outline"
              className="mx-auto flex h-auto w-auto flex-row items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium"
              disabled={isImporting || isBusy}
            >
              <ArrowRightLeft className="!h-3.5 !w-3.5" />
              <span>{isImporting ? 'Opening Passkey...' : 'Switch account'}</span>
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
          <Fingerprint className="!h-6 !w-6" />
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
