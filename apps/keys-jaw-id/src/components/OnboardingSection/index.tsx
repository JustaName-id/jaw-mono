'use client'

import { Button, Input, Spinner } from '@jaw/ui'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@jaw/ui'
import { LocalStorageAccount, useLogin, usePasskeyLogin, usePasskeys, useSubnameCheck } from '@/hooks'
import { WalletIcon } from '@jaw/ui'
import { ChevronRight } from 'lucide-react'
import { useState } from 'react'
import { OrSeparator } from '@jaw/ui'
import { ChainId } from '@/utils/types'
import { useDebounceValue } from 'usehooks-ts'
import { SUPPORTED_CHAINS } from '@/utils/constants'


interface SignInScreenProps {
    onComplete: () => void
    onCreateAccount: () => void
}

export function SignInScreen({ onComplete, onCreateAccount }: SignInScreenProps) {
    const { accounts } = usePasskeys();
    const { mutateAsync: login } = useLogin();
    const { mutateAsync: passkeyLogin, isPending } = usePasskeyLogin();
    const [loggingInAccount, setLoggingInAccount] = useState<string | null>(null);

    const [username, setUsername] = useState('')
    const { hasRequiredSubname, refetch: refetchSubnames, walletAddress } = useSubnameCheck();
    const [debouncedUsername, setDebouncedUsername] = useDebounceValue(username, 500)
    const { isSubnameAvailable, isSubnameAvailableLoading } = useIsSubnameAvailable({
        username,
        ensDomain: process.env.NEXT_PUBLIC_ENS_NAME ?? '',
        chainId: parseInt(process.env.NEXT_PUBLIC_CHAIN_ID!) as ChainId,
        enabled: debouncedUsername.length > 2
    })

    const { mutateAsync: register, isPending } = useCreatePasskey();

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
                await justaname.subnames.addSubname(
                    {
                        username: username,
                        ensDomain: process.env.NEXT_PUBLIC_ENS_NAME ?? '',
                        chainId: parseInt(process.env.NEXT_PUBLIC_CHAIN_ID!) as ChainId,
                        addresses: SUPPORTED_CHAINS.map(chain => ({
                            address: resultWallet,
                            coinType: (+chain.id + 2147483648).toString(),
                        })),
                        overrideSignatureCheck: true,
                    },
                    {
                        xApiKey: process.env.NEXT_PUBLIC_API_KEY!,
                        xAddress: resultWallet,
                        xMessage: "",
                    }
                )

                await refetchSubnames()
            }
            // The useEffect above will handle completion if the subname was successfully claimed
        } catch (error) {
            console.error('Failed to create account:', error)
        }
    }

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
                <div className="flex flex-col gap-1">
                    {accounts.map((account) => (
                        <Button
                            key={account.username}
                            onClick={() => handleAccountSelect(account)}
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
                                        })
                                        }
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
                <Button
                    onClick={() => passkeyLogin()}
                    variant="outline"
                    className="w-full h-10 flex items-center flex-row gap-2"
                    disabled={isPending}
                >
                    <WalletIcon className='!w-6 !h-6' stroke='black' />
                    <span>{isPending ? 'Opening Passkey...' : 'Import an existing account'}</span>
                </Button>

                <OrSeparator />

                {/* {importError && (
                    <div className="text-sm text-red-600 bg-red-50 p-3 rounded">
                        {importError}
                    </div>
                )} */}
                <div className='flex flex-col gap-2'>
                    <div className="flex flex-row items-center gap-2">
                        <Input
                            placeholder="Username"
                            value={username}
                            onChange={(e) => {
                                setUsername(e.target.value)
                                setDebouncedUsername(e.target.value)
                            }}
                            className="flex-1"
                            right={<span className="text-sm font-bold text-foreground">{`.${process.env.NEXT_PUBLIC_ENS_NAME}`}</span>}
                        />
                        {isPending ? (
                            <Spinner className="w-10 h-10 animate-spin" />
                        ) : (
                            <Button
                                onClick={handleCreateAccount}
                                disabled={!username.trim() || username.includes('.') || isSubnameAvailableLoading || !isSubnameAvailable?.isAvailable}
                            >
                                Create Account
                            </Button>
                        )}
                    </div>
                    {username.length > 0 && (
                        <span className="text-sm font-medium text-foreground">
                            {username.includes('.')
                                ? 'Invalid format'
                                : username.length > 2
                                    ? (isSubnameAvailableLoading ? 'Checking availability...' : isSubnameAvailable?.isAvailable ? 'Available' : 'Unavailable')
                                    : 'Minimum 3 characters'
                            }
                        </span>
                    )}

                </div>
            </CardContent>
        </Card>
    )
}