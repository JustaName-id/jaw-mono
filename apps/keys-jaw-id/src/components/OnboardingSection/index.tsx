'use client'

import { LocalStorageAccount, OnboardingDialog } from '@jaw/ui';
import { useLogin, usePasskeyLogin, usePasskeys, useCreatePasskey, useAuth } from '../../hooks';
import { useState } from 'react';
import { SUPPORTED_CHAINS } from 'packages/core/src';
import { Chain } from 'packages/core/src';
import { ChainId } from '@justaname.id/sdk';


interface SignInScreenProps {
    onComplete: () => void
    onCreateAccount: () => void
    ensConfig?: string
    chainId?: ChainId
    apiKey?: string
}

export function SignInScreen({ onComplete, onCreateAccount, ensConfig, chainId, apiKey }: SignInScreenProps) {
    const { accounts, refetchAccounts } = usePasskeys();
    const { mutateAsync: login } = useLogin();
    const { mutateAsync: passkeyLogin, isPending: isImportingPasskey } = usePasskeyLogin();
    const { refetch: refetchAuth } = useAuth();
    const [loggingInAccount, setLoggingInAccount] = useState<string | null>(null);


    console.log('✅ OnboardingSection: ENS Config =', ensConfig || 'NOT PROVIDED')
    console.log('✅ OnboardingSection: ChainId =', chainId || 'NOT PROVIDED')
    console.log('✅ OnboardingSection: ApiKey =', apiKey ? 'PROVIDED' : 'NOT PROVIDED')

    const { mutateAsync: register, isPending: isCreatingPasskey } = useCreatePasskey();

    const handleAccountSelect = async (account: LocalStorageAccount) => {
        try {
            if (!account.credentialId) {
                throw new Error('Credential ID is required');
            }
            setLoggingInAccount(account.username);
            await login({
                chainId: SUPPORTED_CHAINS.find(chain => chain.id === chainId) as Chain,
                credentialId: account.credentialId,
                isImported: account.isImported,
            })
            onComplete()
        } catch (error) {
            console.error("❌ Login failed:", error)
            setLoggingInAccount(null);
        }
    }

    const handleCreateAccount = async (username: string): Promise<string> => {
        if (!username || username.trim().length === 0) {
            console.error('❌ Username is required');
            throw new Error('Username is required');
        }

        const fullUsername = ensConfig ? `${username.trim()}.${ensConfig}` : username.trim();
        const result = await register(fullUsername);

        if (!result.address) {
            throw new Error('Failed to get address from passkey registration');
        }

        return result.address;
    }

    const handleAccountCreationComplete = async () => {
        await refetchAccounts();
        await refetchAuth();
        onComplete();
    }

    const handleImportAccount = async () => {
        try {
            await passkeyLogin();
            onComplete();
        } catch (error) {
            console.error('❌ Import failed:', error);
        }
    };

    return (
        <OnboardingDialog
            accounts={accounts.map(account => ({
                username: account.username,
                creationDate: new Date(account.creationDate),
                credentialId: account.credentialId,
                isImported: account.isImported,
            }))}
            onAccountSelect={handleAccountSelect}
            loggingInAccount={loggingInAccount}
            onImportAccount={handleImportAccount}
            isImporting={isImportingPasskey}
            onCreateAccount={handleCreateAccount}
            onAccountCreationComplete={handleAccountCreationComplete}
            isCreating={isCreatingPasskey}
            ensDomain={ensConfig}
            chainId={chainId}
            apiKey={apiKey}
            supportedChains={SUPPORTED_CHAINS.map(chain => ({ id: chain.id }))}
        />
    );
}