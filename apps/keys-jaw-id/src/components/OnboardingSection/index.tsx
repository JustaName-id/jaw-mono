'use client'

import { LocalStorageAccount, OnboardingDialog } from '@jaw.id/ui';
import { useLogin, usePasskeyLogin, usePasskeys, useCreatePasskey, useAuth } from '../../hooks';
import { useState } from 'react';
import { SUPPORTED_CHAINS, Chain, SubnameTextRecordCapabilityRequest } from '@jaw.id/core';
import { ChainId } from '../../utils/types';


export interface AuthenticatedAccount {
    username: string;
    credentialId: string;
    publicKey: `0x${string}`;
    isImported: boolean;
}

interface SignInScreenProps {
    onComplete: (authenticatedAccount?: AuthenticatedAccount) => void
    ensConfig?: string
    chainId?: ChainId
    apiKey?: string
    chainConfig?: { id: number; rpcUrl?: string; paymasterUrl?: string }
    subnameTextRecords?: SubnameTextRecordCapabilityRequest
}

export function SignInScreen({ onComplete, ensConfig, chainId, apiKey, chainConfig, subnameTextRecords }: SignInScreenProps) {
    const { accounts, refetchAccounts } = usePasskeys({ apiKey });
    const { mutateAsync: login } = useLogin();
    const { mutateAsync: passkeyLogin, isPending: isImportingPasskey } = usePasskeyLogin();
    const { refetch: refetchAuth } = useAuth();
    const [loggingInAccount, setLoggingInAccount] = useState<string | null>(null);


    const { mutateAsync: register, isPending: isCreatingPasskey } = useCreatePasskey();

    const handleAccountSelect = async (account: LocalStorageAccount) => {
        try {
            if (!account.credentialId) {
                throw new Error('Credential ID is required');
            }
            setLoggingInAccount(account.username);

            let targetChain: Chain;

            if (chainConfig && chainConfig.rpcUrl) {
                targetChain = {
                    id: chainConfig.id,
                    rpcUrl: chainConfig.rpcUrl,
                    ...(chainConfig.paymasterUrl && { paymaster: { url: chainConfig.paymasterUrl } })
                };
            } else {
                const fallbackChain = SUPPORTED_CHAINS.find(chain => chain.id === (chainId ?? 1));
                if (!fallbackChain) {
                    throw new Error(`Chain ${chainId ?? 1} is not supported`);
                }
                targetChain = { id: fallbackChain.id };
            }

            await login({
                chainId: targetChain,
                credentialId: account.credentialId,
                isImported: account.isImported,
                apiKey,
            })

            // Find the full account info from the accounts array (which has publicKey)
            const fullAccount = accounts.find(a => a.credentialId === account.credentialId);

            // Pass the authenticated account to onComplete
            onComplete(fullAccount ? {
                username: fullAccount.username,
                credentialId: fullAccount.credentialId,
                publicKey: fullAccount.publicKey as `0x${string}`,
                isImported: fullAccount.isImported,
            } : undefined)
        } catch (error) {
            console.error("Login failed:", error)
            setLoggingInAccount(null);
        }
    }

    const handleCreateAccount = async (username: string): Promise<string> => {
        try {

            if (!username || username.trim().length === 0) {
                console.error('❌ Username is required');
                throw new Error('Username is required');
            }

            const fullUsername = ensConfig ? `${username.trim()}.${ensConfig}` : username.trim();

            const result = await register({ username: fullUsername, apiKey, defaultChainId: chainId });

            if (!result.address) {
                throw new Error('Failed to get address from passkey registration');
            }

            return result.address;
        } catch (error) {
            console.error('Account creation error:', error instanceof Error ? error.message : String(error));
            throw error;
        }
    }

    const handleAccountCreationComplete = async () => {
        const result = await refetchAccounts();
        await refetchAuth();
        // The newest account is the one just created
        const newAccounts = result.data || [];
        const newestAccount = newAccounts[newAccounts.length - 1];
        onComplete(newestAccount ? {
            username: newestAccount.username,
            credentialId: newestAccount.credentialId,
            publicKey: newestAccount.publicKey as `0x${string}`,
            isImported: newestAccount.isImported,
        } : undefined);
    }

    const handleImportAccount = async () => {
        try {
            await passkeyLogin({ apiKey, defaultChainId: chainId });
            // Refetch to get the imported account
            const result = await refetchAccounts();
            const importedAccounts = result.data || [];
            // The imported account should be the newest one
            const importedAccount = importedAccounts[importedAccounts.length - 1];
            onComplete(importedAccount ? {
                username: importedAccount.username,
                credentialId: importedAccount.credentialId,
                publicKey: importedAccount.publicKey as `0x${string}`,
                isImported: importedAccount.isImported,
            } : undefined);
        } catch (error) {
            console.error('Import failed:', error);
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
            subnameTextRecords={subnameTextRecords}
        />
    );
}