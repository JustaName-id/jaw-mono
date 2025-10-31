'use client'

import { LocalStorageAccount, OnboardingDialog } from '@jaw/ui';
import { useLogin, usePasskeyLogin, usePasskeys, useCreatePasskey } from '../../hooks';
import { useState } from 'react';
import { useDebounceValue } from 'usehooks-ts';
// import { ChainId } from '@/utils/types';
// import { SUPPORTED_CHAINS } from '@/utils/constants';


interface SignInScreenProps {
    onComplete: () => void
    onCreateAccount: () => void
}

export function SignInScreen({ onComplete, onCreateAccount }: SignInScreenProps) {
    const { accounts, refetchAccounts } = usePasskeys();
    const { mutateAsync: login } = useLogin();
    const { mutateAsync: passkeyLogin, isPending: isImportingPasskey } = usePasskeyLogin();
    const [loggingInAccount, setLoggingInAccount] = useState<string | null>(null);

    const [username, setUsername] = useState('')
    // TODO: Re-enable subname check when implementing ENS subname registration
    // const { hasRequiredSubname, refetch: refetchSubnames, walletAddress } = useSubnameCheck();

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

            // Always create passkey with username (don't check walletAddress)
            const result = await register(username.trim())

            // TODO: Subname registration - implement later
            // if (!!result.address) {
            //     await justaname.subnames.addSubname(
            //         {
            //             username: username,
            //             ensDomain: process.env.NEXT_PUBLIC_ENS_NAME ?? '',
            //             chainId: parseInt(process.env.NEXT_PUBLIC_CHAIN_ID!) as ChainId,
            //             addresses: SUPPORTED_CHAINS.map(chain => ({
            //                 address: result.address,
            //                 coinType: (+chain.id + 2147483648).toString(),
            //             })),
            //             overrideSignatureCheck: true,
            //         },
            //         {
            //             xApiKey: process.env.NEXT_PUBLIC_API_KEY!,
            //             xAddress: result.address,
            //             xMessage: "",
            //         }
            //     )
            //     await refetchSubnames()
            // }

            // Refetch accounts to update the UI with the newly created passkey
            await refetchAccounts();

            // Call onComplete after successful account creation
            onComplete();
        } catch (error) {
            console.error('❌ Failed to create account:', error)
        }
    }

    const handleImportAccount = async () => {
        try {
            const result = await passkeyLogin();
            onComplete();
        } catch (error) {
            console.error('❌ Import failed:', error);
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