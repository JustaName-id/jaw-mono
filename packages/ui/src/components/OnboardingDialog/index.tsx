'use client'

import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Spinner } from '../ui/spinner';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card';
import { WalletIcon } from '../../icons';
import { ChevronRight } from 'lucide-react';
import { OrSeparator } from '../OrSeparator';
import { OnboardingDialogProps } from './types';

export function OnboardingDialog({
  accounts,
  onAccountSelect,
  loggingInAccount,
  onImportAccount,
  isImporting,
  username,
  onUsernameChange,
  onCreateAccount,
  isCreating,
  usernameValidation,
  ensDomain,
}: OnboardingDialogProps) {
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
              key={account.username}
              onClick={() => onAccountSelect(account)}
              variant="ghost"
              className="w-full h-auto !py-2 !px-3 flex items-center justify-between hover:bg-muted/50"
              disabled={loggingInAccount !== null}
            >
              <div className="flex items-center flex-row gap-2">
                <WalletIcon className='!w-6 !h-6' />
                <div className="text-left">
                  <p className="text-sm font-normal text-foreground">
                    {account.username}
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
              onChange={(e) => onUsernameChange(e.target.value)}
              className="flex-1"
              right={<span className="text-sm font-bold text-foreground">{`.${ensDomain}`}</span>}
            />
            {isCreating ? (
              <Spinner className="w-10 h-10 animate-spin" />
            ) : (
              <Button
                onClick={onCreateAccount}
                disabled={!usernameValidation.isValid || usernameValidation.isLoading}
              >
                Create Account
              </Button>
            )}
          </div>
          {username.length > 0 && (
            <span className="text-sm font-medium text-foreground">
              {usernameValidation.message}
            </span>
          )}
        </div>
      </CardContent>
    </Card>
  )
}

export * from './types';
