'use client'

import { LocalStorageAccount, OnboardingDialog } from '@jaw/ui';
import { useLogin, usePasskeyLogin, usePasskeys, useSubnameCheck, useCreatePasskey } from '../../hooks';
import { useState } from 'react';
import { useDebounceValue } from 'usehooks-ts';
// import { ChainId } from '@/utils/types';
// import { SUPPORTED_CHAINS } from '@/utils/constants';


interface SignInScreenProps {
    onComplete: () => void
    onCreateAccount: () => void
}

export function SignInScreen({ onComplete, onCreateAccount }: SignInScreenProps) {
    const { accounts } = usePasskeys();
    const { mutateAsync: login } = useLogin();
    const { mutateAsync: passkeyLogin, isPending: isImportingPasskey } = usePasskeyLogin();
    const [loggingInAccount, setLoggingInAccount] = useState<string | null>(null);

    const [username, setUsername] = useState('')
    const { hasRequiredSubname, refetch: refetchSubnames, walletAddress } = useSubnameCheck();
    // const [debouncedUsername, setDebouncedUsername] = useDebounceValue(username, 500)
    // const { isSubnameAvailable, isSubnameAvailableLoading } = useIsSubnameAvailable({
    //     username,
    //     ensDomain: process.env.NEXT_PUBLIC_ENS_NAME ?? '',
    //     chainId: parseInt(process.env.NEXT_PUBLIC_CHAIN_ID!) as ChainId,
    //     enabled: debouncedUsername.length > 2
    // })
    const isSubnameAvailable = {
        isAvailable: true,
    };
    const isSubnameAvailableLoading = false;

    const { mutateAsync: register, isPending: isCreatingPasskey } = useCreatePasskey();

    const handleAccountSelect = async (account: LocalStorageAccount) => {
        try {
            if (!account.credentialId) {
                throw new Error('Credential ID is required');
            }
            setLoggingInAccount(account.username);
            await login({
                credentialId: account.credentialId,
                isImported: account.isImported,
            })
            onComplete()
        } catch (error) {
            console.error("Login failed:", error)
            setLoggingInAccount(null);
        }
    }

    const handleCreateAccount = async () => {
        let resultWallet = "";
        try {
            if (!walletAddress) {
                const result = await register(`${username}.${process.env.NEXT_PUBLIC_ENS_NAME}`)
                resultWallet = result.address;
            } else {
                resultWallet = walletAddress;
            }

            if (!!resultWallet) {
                // await justaname.subnames.addSubname(
                //     {
                //         username: username,
                //         ensDomain: process.env.NEXT_PUBLIC_ENS_NAME ?? '',
                //         chainId: parseInt(process.env.NEXT_PUBLIC_CHAIN_ID!) as ChainId,
                //         addresses: SUPPORTED_CHAINS.map(chain => ({
                //             address: resultWallet,
                //             coinType: (+chain.id + 2147483648).toString(),
                //         })),
                //         overrideSignatureCheck: true,
                //     },
                //     {
                //         xApiKey: process.env.NEXT_PUBLIC_API_KEY!,
                //         xAddress: resultWallet,
                //         xMessage: "",
                //     }
                // )

                await refetchSubnames()
            }

            // Call onComplete after successful account creation
            onComplete();
        } catch (error) {
            console.error('Failed to create account:', error)
        }
    }

    const handleImportAccount = async () => {
        try {
            await passkeyLogin();
            onComplete();
        } catch (error) {
            console.error('Import failed:', error);
        }
    };

    // Build validation message
    const getValidationMessage = (): string => {
        if (username.includes('.')) {
            return 'Invalid format';
        }
        if (username.length > 0 && username.length <= 2) {
            return 'Minimum 3 characters';
        }
        if (isSubnameAvailableLoading) {
            return 'Checking availability...';
        }
        if (isSubnameAvailable?.isAvailable) {
            return 'Available';
        }
        return 'Unavailable';
    };

    const isUsernameValid =
        !username.includes('.') &&
        username.length > 2 &&
        !isSubnameAvailableLoading &&
        isSubnameAvailable?.isAvailable;

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
                // setDebouncedUsername(value);
            }}
            onCreateAccount={handleCreateAccount}
            isCreating={isCreatingPasskey}
            usernameValidation={{
                isValid: isUsernameValid,
                isLoading: isSubnameAvailableLoading,
                message: getValidationMessage(),
            }}
            ensDomain={process.env.NEXT_PUBLIC_ENS_NAME ?? ''}
        />
    );
}