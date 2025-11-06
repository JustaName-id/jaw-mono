'use client'

import { LocalStorageAccount, OnboardingDialog } from '@jaw/ui';
import { useLogin, usePasskeyLogin, usePasskeys, useCreatePasskey, useAuth } from '../../hooks';
import { useState } from 'react';
import { useDebounceValue } from 'usehooks-ts';
import { SUPPORTED_CHAINS } from 'packages/core/src';
// import { useIsSubnameAvailable, useJustaName } from '@justaname.id/react'
import { Chain } from 'packages/core/src';


interface SignInScreenProps {
    onComplete: () => void
    onCreateAccount: () => void
    ensConfig?: string
    chainId?: number
    apiKey?: string
}

export function SignInScreen({ onComplete, onCreateAccount, ensConfig, chainId, apiKey }: SignInScreenProps) {
    const { accounts, refetchAccounts } = usePasskeys();
    const { mutateAsync: login } = useLogin();
    const { mutateAsync: passkeyLogin, isPending: isImportingPasskey } = usePasskeyLogin();
    const { refetch: refetchAuth } = useAuth();
    const [loggingInAccount, setLoggingInAccount] = useState<string | null>(null);

    const [username, setUsername] = useState('')
    const [debouncedUsername] = useDebounceValue(username, 500)

    console.log('✅ OnboardingSection: ENS Config =', ensConfig || 'NOT PROVIDED')
    console.log('✅ OnboardingSection: ChainId =', chainId || 'NOT PROVIDED')
    console.log('✅ OnboardingSection: ApiKey =', apiKey ? 'PROVIDED' : 'NOT PROVIDED')

    // const { justaname } = useJustaName();
    // const { isSubnameAvailable, isSubnameAvailableLoading } = useIsSubnameAvailable({
    //     username,
    //     ensDomain: ensConfig ?? '',
    //     chainId: chainId as ChainId,
    //     enabled: !!ensConfig && debouncedUsername.length > 2
    // })


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

    const handleCreateAccount = async () => {
        try {

            // Validate username
            if (!username || username.trim().length === 0) {
                console.error('❌ Username is required');
                return;
            }

            const fullUsername = ensConfig ? `${username.trim()}.${ensConfig}` : username.trim();
            const result = await register(fullUsername);

            if (ensConfig && chainId && apiKey && !!result.address) {
                try {
                    console.log('📝 Registering subname:', username, 'on', ensConfig, 'chain', chainId)
                    // await justaname.subnames.addSubname(
                    //     {
                    //         username: username,
                    //         ensDomain: ensConfig,
                    //         chainId: chainId as ChainId,
                    //         addresses: SUPPORTED_CHAINS.map(chain => ({
                    //             address: result.address,
                    //             coinType: (+chain.id + 2147483648).toString(),
                    //         })),
                    //         overrideSignatureCheck: true,
                    //     },
                    //     {
                    //         xApiKey: apiKey,
                    //         xAddress: result.address,
                    //         xMessage: "",
                    //     }
                    // )
                    console.log('✅ Subname registration would happen here (JustaName SDK not yet configured)')
                } catch (error) {
                    console.error('❌ Failed to register subname:', error)
                }
            } else {
                console.log('⏭️ Skipping subname registration - ENS config not provided or incomplete')
            }

            await refetchAccounts();

            await refetchAuth();

            onComplete();
        } catch (error) {
            console.error('❌ Failed to create account:', error)
        }
    }

    const handleImportAccount = async () => {
        try {
            await passkeyLogin();
            onComplete();
        } catch (error) {
            console.error('❌ Import failed:', error);
        }
    };

    const getValidationMessage = (): string => {
        if (username.includes('.')) {
            return 'Invalid format';
        }

        if (username.length > 0 && username.length <= 2) {
            return 'Minimum 3 characters';
        }

        if (username.length === 0) {
            return '';
        }

        if (!ensConfig) {
            return 'Available';
        }
        // if (isSubnameAvailableLoading) {
        //     return 'Checking availability...';
        // }
        // if (isSubnameAvailable?.isAvailable) {
        //     return 'Available';
        // }
        return 'Unavailable';
    };

    const isUsernameValid: boolean = (() => {
        if (username.includes('.')) return false;
        if (username.length <= 2) return false;

        if (!ensConfig) return true;

        // if (isSubnameAvailableLoading) return false;
        // return isSubnameAvailable?.isAvailable === true;
        return true;
    })();


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
            username={username}
            onUsernameChange={(value) => {
                setUsername(value);
            }}
            onCreateAccount={handleCreateAccount}
            isCreating={isCreatingPasskey}
            usernameValidation={{
                isValid: isUsernameValid,
                // Not sure , how its used , just made this change to check.
                isLoading: false,
                message: getValidationMessage(),
            }}
            ensDomain={ensConfig ?? ''}
        />
    );
}