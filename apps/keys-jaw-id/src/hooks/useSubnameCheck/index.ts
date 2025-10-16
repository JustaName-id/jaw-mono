import { Records, useAddressSubnames } from '@justaname.id/react'
import { useMemo } from 'react'
import { useAuth } from '../useAuth'
import { ChainId } from '@/utils/types'

interface UseSubnameCheckResult {
    hasRequiredSubname: boolean
    connectedSubname: Records | null
    allSubnames: Records[]
    isLoading: boolean
    isError: boolean
    walletAddress: string | null
    refetch: () => void
}

export const useSubnameCheck = (): UseSubnameCheckResult => {
    const { isAuthenticated, walletAddress, isLoading: isAuthLoading } = useAuth()
    
    const ensName = process.env.NEXT_PUBLIC_ENS_NAME ?? 'justanexample.eth'
    const chainId = parseInt(process.env.NEXT_PUBLIC_CHAIN_ID!) as ChainId


    const shouldFetchSubnames = isAuthenticated && !!walletAddress

    const { 
        addressSubnames, 
        isAddressSubnamesPending, 
        isAddressSubnamesFetching,
        refetchAddressSubnames 
    } = useAddressSubnames({
        address: walletAddress || undefined,
        chainId: chainId,
        isClaimed: true,
        enabled: shouldFetchSubnames
    })


    const processedSubnames = useMemo(() => {
        const requiredSubnames = addressSubnames?.filter(subname => 
            subname.ens.endsWith(`.${ensName}`)
        ) || []

        return {
            allSubnames: addressSubnames,
            requiredSubnames,
            hasRequiredSubname: requiredSubnames.length > 0
        }
    }, [addressSubnames, ensName])

    const isLoading = useMemo(() => {
        if (!isAuthenticated || isAuthLoading) return true
        if (walletAddress && shouldFetchSubnames) {
            return isAddressSubnamesPending || isAddressSubnamesFetching
        }
        return false
    }, [isAuthenticated, isAuthLoading, walletAddress, shouldFetchSubnames, isAddressSubnamesPending, isAddressSubnamesFetching])

    const isError = !isAuthenticated && !isLoading

    return {
        hasRequiredSubname: processedSubnames.hasRequiredSubname,
        connectedSubname: processedSubnames.requiredSubnames[0],
        allSubnames: processedSubnames.allSubnames,
        isLoading,
        isError,
        walletAddress: walletAddress || null,
        refetch: refetchAddressSubnames
    }
}
