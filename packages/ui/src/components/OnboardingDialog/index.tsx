'use client';

import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Spinner } from '../ui/spinner';
import { ArrowRightLeft, ChevronLeft, ChevronRight, Fingerprint, ScanFace } from 'lucide-react';
import { DialogShell } from '../DialogShell';
import { AccountIdenticon } from '../AccountIdenticon';
import { IdentityAvatar } from '../IdentityAvatar';
import { OnboardingDialogProps, LocalStorageAccount } from './types';
import { selectDefaultAccount } from './selectDefaultAccount';
import { useState, useEffect, useMemo } from 'react';
import { getJustaNameInstance } from '../../utils/justaNameInstance';
import { ensMetadataAvatarUrl } from '../../utils/reverseResolve';
import { cn } from '../../lib/utils';
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

/** Hairline divider with a small mono uppercase label ("NEW TO JAW?", "OR"). */
function MonoDivider({ label, className }: { label: string; className?: string }) {
  return (
    <div className={cn('flex items-center gap-2.5', className)}>
      <span className="bg-border h-px flex-1" />
      <span className="text-muted-foreground font-mono text-[9px] font-medium uppercase tracking-[0.14em]">
        {label}
      </span>
      <span className="bg-border h-px flex-1" />
    </div>
  );
}

/**
 * Username input + availability check + Create button + error display.
 * Shared between the fresh sign-in view and the "Create new account" path.
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
      <Input
        placeholder="username"
        value={username}
        onChange={(e) => setUsername(e.target.value)}
        className="h-11 rounded-[10.5px] bg-white/[.04] font-mono text-[13px]"
        // Prevent password-manager extensions (1Password, LastPass, Dashlane,
        // Bitwarden) from attaching their inline overlay to this field. Their
        // overlay covers the embedded iframe, which the clickjacking guard
        // (EnsureVisibility) then reads as occlusion and disables interaction.
        autoComplete="off"
        data-1p-ignore
        data-lpignore="true"
        data-form-type="other"
        data-bwignore
        right={
          ensDomain ? <span className="text-muted-foreground font-mono text-xs">{`.${ensDomain}`}</span> : undefined
        }
      />
      {username.length > 0 && message && !error && (
        <span
          className={`px-1 text-xs font-medium ${
            isLoading ? 'text-muted-foreground' : isValid ? 'text-success' : 'text-destructive'
          }`}
        >
          {message}
        </span>
      )}
      {isCreating ? (
        <div className="flex h-11 items-center justify-center">
          <Spinner className="h-6 w-6" />
        </div>
      ) : (
        <Button
          variant="outline"
          onClick={async () => {
            try {
              await handleCreateAccountClick();
            } catch (err) {
              console.error('❌ Button onClick caught error:', err);
            }
          }}
          disabled={!isValid || isLoading}
          className="text-secondary-foreground h-11 w-full rounded-[10.5px] border-white/[.14] bg-transparent text-[13px] font-semibold"
        >
          <ScanFace className="!h-4 !w-4" />
          Create Account
        </Button>
      )}
      {error && (
        <div className="bg-destructive/10 border-destructive/20 flex flex-col gap-2 overflow-hidden rounded-md border px-2 py-2">
          <span className="text-destructive-foreground break-all text-xs font-medium">{error}</span>
          <Button
            onClick={() => setError(null)}
            variant="ghost"
            className="text-destructive-foreground hover:text-destructive-foreground/80 hover:bg-destructive/10 h-6 text-xs"
          >
            Dismiss
          </Button>
        </div>
      )}
    </div>
  );
}

type OnboardingView = 'welcome' | 'switch' | 'signin';

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

  const [view, setView] = useState<OnboardingView>(defaultAccount ? 'welcome' : 'signin');
  const isBusy = loggingInAccount !== null || isImporting || isCreating;

  // ENS avatar straight from the DISPLAYED name (the stored username, plus the
  // configured domain for bare labels). No resolution round-trip: the metadata
  // proxy resolves the record server-side and IdentityAvatar falls back to the
  // blob when the name has no avatar (404) or isn't registered.
  const avatarFor = (account: LocalStorageAccount) => {
    const name = account.username.includes('.')
      ? account.username
      : ensDomain
        ? `${account.username}.${ensDomain}`
        : null;
    return name ? ensMetadataAvatarUrl(name) : undefined;
  };

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

  const passkeyButton = (
    <Button
      onClick={onImportAccount}
      disabled={isBusy}
      className="h-11 w-full rounded-[10.5px] text-[13px] font-semibold"
    >
      <Fingerprint className="!h-4 !w-4" />
      {isImporting ? 'Opening Passkey...' : 'Sign in with Passkey'}
    </Button>
  );

  // Fresh sign-in / create view — also the "Create new account" destination.
  if (view === 'signin' || !defaultAccount) {
    return (
      <DialogShell>
        <div className="flex flex-col p-6 pt-7">
          <h2 className="text-foreground text-[26px] font-bold leading-none tracking-[-0.03em]">
            Sign <span className="italic">in.</span>
          </h2>
          <p className="text-muted-foreground mt-2 text-[13px]">Use a saved passkey, or create a new account.</p>

          <div className="mt-6">{passkeyButton}</div>

          <MonoDivider label={`New to ${ensDomain ?? 'JAW'}?`} className="my-5" />

          {createForm}

          {defaultAccount && (
            <button
              onClick={() => setView('welcome')}
              disabled={isBusy}
              className="text-muted-foreground hover:text-foreground mx-auto mt-4 flex cursor-pointer items-center gap-1 bg-transparent text-xs font-medium transition-colors"
            >
              <ChevronLeft className="h-3.5 w-3.5" />
              Back
            </button>
          )}
        </div>
      </DialogShell>
    );
  }

  // Switch-account view — pick a stored account or use a different passkey.
  if (view === 'switch') {
    return (
      <DialogShell>
        <div className="flex flex-col p-6 pt-5">
          <button
            onClick={() => setView('welcome')}
            disabled={isBusy}
            className="text-muted-foreground hover:text-foreground -ml-1 flex cursor-pointer items-center gap-1 self-start bg-transparent py-1 text-[11px] font-medium transition-colors"
          >
            <ChevronLeft className="h-3.5 w-3.5" />
            Back
          </button>
          <h2 className="text-foreground mt-2 text-[22px] font-bold leading-none tracking-[-0.03em]">
            Switch <span className="italic">account.</span>
          </h2>

          <div className="mt-4 flex flex-col">
            {accounts.map((account: LocalStorageAccount) => (
              <button
                key={account.credentialId ?? account.username}
                onClick={() => onAccountSelect(account)}
                disabled={isBusy}
                className="border-border hover:bg-accent flex cursor-pointer items-center gap-3 border-b bg-transparent px-1 py-3 text-left transition-colors first:border-t disabled:cursor-default disabled:opacity-60"
              >
                <IdentityAvatar
                  src={avatarFor(account)}
                  className="h-9 w-9 rounded-[10px]"
                  fallback={<AccountIdenticon seed={account.username} size={36} />}
                />
                <span className="text-foreground min-w-0 flex-1 truncate text-sm font-semibold">
                  {account.username}
                </span>
                {loggingInAccount === account.username ? (
                  <Spinner className="!h-4 !w-4" />
                ) : (
                  <ChevronRight className="text-muted-foreground h-4 w-4 flex-none" />
                )}
              </button>
            ))}
          </div>

          <MonoDivider label="or" className="my-4" />

          <Button
            onClick={onImportAccount}
            disabled={isBusy}
            variant="outline"
            className="text-secondary-foreground h-11 w-full rounded-[10.5px] border-white/[.14] bg-transparent text-[13px] font-semibold"
          >
            <Fingerprint className="!h-4 !w-4" />
            {isImporting ? 'Opening Passkey...' : 'Use a different passkey'}
          </Button>
        </div>
      </DialogShell>
    );
  }

  // Welcome-back view — one-tap continue with the last account.
  return (
    <DialogShell>
      <div className="flex flex-col p-6 pt-7">
        <h2 className="text-foreground text-[26px] font-bold leading-none tracking-[-0.03em]">
          Welcome <span className="italic">back.</span>
        </h2>
        <p className="text-muted-foreground mt-2 text-[13px]">Pick up where you left off.</p>

        <button
          onClick={() => onAccountSelect(defaultAccount)}
          disabled={isBusy}
          className="bg-primary hover:bg-primary/90 mt-6 flex cursor-pointer items-center gap-3 rounded-[12px] p-3 text-left transition-colors disabled:cursor-default disabled:opacity-70"
        >
          <IdentityAvatar
            src={avatarFor(defaultAccount)}
            className="h-10 w-10 rounded-[12px]"
            fallback={<AccountIdenticon seed={defaultAccount.username} size={40} />}
          />
          <span className="flex min-w-0 flex-1 flex-col gap-0.5">
            <span className="text-primary-foreground/60 font-mono text-[9px] font-medium uppercase tracking-[0.14em]">
              Continue as
            </span>
            <span className="text-primary-foreground truncate text-[15px] font-semibold">
              {defaultAccount.username || 'your account'}
            </span>
          </span>
          {loggingInAccount === defaultAccount.username ? (
            <Spinner className="!h-4 !w-4 text-[#0B0F1A]" />
          ) : (
            <ChevronRight className="text-primary-foreground/70 h-4 w-4 flex-none" />
          )}
        </button>

        <MonoDivider label="or" className="my-5" />

        <Button
          onClick={() => setView('switch')}
          disabled={isBusy}
          variant="outline"
          className="text-secondary-foreground h-11 w-full rounded-[10.5px] border-white/[.14] bg-transparent text-[13px] font-semibold"
        >
          <ArrowRightLeft className="!h-3.5 !w-3.5" />
          Switch account
        </Button>

        <button
          onClick={() => setView('signin')}
          disabled={isBusy}
          className="text-muted-foreground hover:text-foreground mx-auto mt-4 cursor-pointer bg-transparent text-xs font-medium transition-colors"
        >
          Create new account
        </button>
      </div>
    </DialogShell>
  );
}

export * from './types';
export * from './accountHelpers';
