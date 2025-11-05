'use client'

import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Spinner } from '../ui/spinner';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card';
import { WalletIcon } from '../../icons';
import { ChevronRight } from 'lucide-react';
import { OrSeparator } from '../OrSeparator';
import { OnboardingDialogProps } from './types';
import { useState, useEffect } from 'react';
import { getJustaNameInstance } from '../../utils/justaNameInstance';

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
  apiKey,
  supportedChains,
}: OnboardingDialogProps) {
  // Validation state
  const [isValid, setIsValid] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [username, setUsername] = useState('')
  const [debouncedUsername, setDebouncedUsername] = useState(username);

  // Debounce username input
  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedUsername(username);
    }, 500);

    return () => {
      clearTimeout(handler);
    };
  }, [username]);

  // Validate username and check availability
  useEffect(() => {
    const validateUsername = async () => {
      // Reset state
      setIsLoading(false);
      setIsValid(false);
      setMessage('');

      // Check if username includes dots
      if (username.includes('.')) {
        setMessage('Invalid format');
        setIsValid(false);
        return;
      }

      // Check minimum length
      if (username.length > 0 && username.length <= 2) {
        setMessage('Minimum 3 characters');
        setIsValid(false);
        return;
      }

      // If username is empty, don't show anything
      if (username.length === 0) {
        return;
      }

      // If no ensDomain, just validate format and length
      if (!ensDomain) {
        setMessage('Available');
        setIsValid(true);
        return;
      }

      // Check availability with SDK
      if (debouncedUsername.length > 2 && chainId) {
        setIsLoading(true);
        setMessage('Checking availability...');

        try {
          const justaName = getJustaNameInstance();
          const result = await justaName.subnames.isSubnameAvailable({
            subname: debouncedUsername + '.' + ensDomain,
            chainId: chainId,
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
  }, [debouncedUsername, username, ensDomain, chainId]);

  const handleCreateAccountClick = async () => {
    try {
      const address = await onCreateAccount(username);

      if (ensDomain && chainId && apiKey && supportedChains && address) {
        try {
          const justaName = getJustaNameInstance();

          const addresses = supportedChains.map(chain => ({
            address: address,
            coinType: (+chain.id + 2147483648).toString(),
          }));

          await justaName.subnames.addSubname(
            {
              username: username,
              ensDomain: ensDomain,
              chainId: chainId,
              addresses: addresses,
              overrideSignatureCheck: true,
            },
            {
              xApiKey: apiKey,
              xAddress: address,
              xMessage: "",
            }
          );

          console.log('✅ Subname registered successfully:', username + '.' + ensDomain);
        } catch (error) {
          console.error('❌ Failed to register subname:', error);
          throw new Error(`Failed to register subname: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
      }

      await onAccountCreationComplete();
    } catch (error) {
      console.error('❌ Account creation failed:', error);
      throw error;
    }
  };

  return (
    <Card className="w-full max-w-md shadow-xl">
      <CardHeader className="flex flex-col gap-1">
        <CardTitle className="text-xl font-normal">
          Sign In
        </CardTitle>

        <CardDescription className='text-xs font-medium'>
          {`Choose one of your existing accounts below to sign in instantly.
          If you're on a new device or don't see your account listed, you can
          import it from your cloud backup.`}
        </CardDescription>
      </CardHeader>

      <CardContent className="flex flex-col gap-5">
        {/* Existing Accounts */}
        <div className="flex flex-col gap-1">
          {accounts.map((account) => (
            <Button
              key={account.credentialId || account.username || Math.random().toString()}
              onClick={() => onAccountSelect(account)}
              variant="ghost"
              className="w-full h-auto !py-2 !px-3 flex items-center justify-between hover:bg-muted/50"
              disabled={loggingInAccount !== null}
            >
              <div className="flex items-center flex-row gap-2">
                <WalletIcon className='!w-6 !h-6' />
                <div className="text-left">
                  <p className="text-sm font-normal text-foreground">
                    {account.username || 'Unnamed Account'}
                  </p>
                  <p className="text-xs font-semibold text-muted-foreground">
                    {new Date(account.creationDate).toLocaleDateString('en-US', {
                      year: 'numeric',
                      month: 'short',
                      day: 'numeric'
                    })}
                  </p>
                </div>
              </div>
              {loggingInAccount === account.username ? (
                <Spinner className="!h-5 !w-5" />
              ) : (
                <ChevronRight className="!h-5 !w-5 text-black" />
              )}
            </Button>
          ))}
        </div>

        {/* Import Account Button */}
        <Button
          onClick={onImportAccount}
          variant="outline"
          className="w-full h-10 flex items-center flex-row gap-2"
          disabled={isImporting}
        >
          <WalletIcon className='!w-6 !h-6' stroke='black' />
          <span>{isImporting ? 'Opening Passkey...' : 'Import an existing account'}</span>
        </Button>

        <OrSeparator />

        {/* Create New Account */}
        <div className='flex flex-col gap-2'>
          <div className="flex flex-row items-center gap-2">
            <Input
              placeholder="Username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="flex-1"
              right={ensDomain ? <span className="text-sm font-bold text-foreground">{`.${ensDomain}`}</span> : undefined}
            />
            {isCreating ? (
              <Spinner className="w-10 h-10 animate-spin" />
            ) : (
              <Button
                onClick={handleCreateAccountClick}
                disabled={!isValid || isLoading}
              >
                Create Account
              </Button>
            )}
          </div>
          {username.length > 0 && message && (
            <div className="flex items-center justify-between px-1">
              <span className={`text-xs font-medium ${isLoading
                ? 'text-muted-foreground'
                : isValid
                  ? 'text-green-600'
                  : 'text-red-600'
                }`}>
                {message}
              </span>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  )
}

export * from './types';
