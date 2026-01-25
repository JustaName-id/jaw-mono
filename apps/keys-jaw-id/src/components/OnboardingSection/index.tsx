'use client'

import { LocalStorageAccount, OnboardingDialog } from '@jaw.id/ui';
import { useLogin, usePasskeyLogin, usePasskeys, useCreatePasskey, useAuth } from '../../hooks';
import { useState, useMemo } from 'react';
import { SUPPORTED_CHAINS, Chain, SubnameTextRecordCapabilityRequest, JAW_RPC_URL } from '@jaw.id/core';
import { ChainId } from '../../utils/types';

// Authenticated account data returned after successful login
export interface AuthenticatedAccount {
    address: `0x${string}`;
    credentialId: string;
    username: string;
    publicKey: `0x${string}`;
}

interface SignInScreenProps {
    onComplete: () => void
    ensConfig?: string
    chainId?: ChainId
    apiKey?: string
    chainConfig?: { id: number; rpcUrl?: string; paymasterUrl?: string }
    subnameTextRecords?: SubnameTextRecordCapabilityRequest
    origin?: string  // Origin for per-origin auth session
}

export function SignInScreen({ onComplete, ensConfig, chainId, apiKey, chainConfig, subnameTextRecords, origin }: SignInScreenProps) {
    const { accounts, refetchAccounts } = usePasskeys({ apiKey });
    const { mutateAsync: login } = useLogin();
    const { mutateAsync: passkeyLogin, isPending: isImportingPasskey } = usePasskeyLogin();
    const { refetch: refetchAuth } = useAuth({ origin });
    const [loggingInAccount, setLoggingInAccount] = useState<string | null>(null);

    // Compute mainnet RPC URL for JustaName SDK (ENS resolution)
    const mainnetRpcUrl = useMemo(() => {
        return apiKey ? `${JAW_RPC_URL}?chainId=1&api-key=${apiKey}` : `${JAW_RPC_URL}?chainId=1`;
    }, [apiKey]);

    console.log('✅ OnboardingSection: ENS Config =', ensConfig || 'NOT PROVIDED')
    console.log('✅ OnboardingSection: ChainId =', chainId || 'NOT PROVIDED')
    console.log('✅ OnboardingSection: ApiKey =', apiKey ? 'PROVIDED' : 'NOT PROVIDED')
    console.log('✅ OnboardingSection: SubnameTextRecords =', subnameTextRecords)

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
            onComplete()
        } catch (error) {
            console.error("❌ Login failed:", error)
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
            console.error('❌ Error details:', error instanceof Error ? error.message : String(error));
            throw error;
        }
    }

    const handleAccountCreationComplete = async () => {
        await refetchAccounts();
        await refetchAuth();
        onComplete();
    }

    const handleImportAccount = async () => {
        try {
            await passkeyLogin({ apiKey, defaultChainId: chainId });
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
            mainnetRpcUrl={mainnetRpcUrl}
            apiKey={apiKey}
            supportedChains={SUPPORTED_CHAINS.map(chain => ({ id: chain.id }))}
            subnameTextRecords={subnameTextRecords}
        />
    );
}