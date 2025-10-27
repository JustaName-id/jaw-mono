// import { Records, useAddressSubnames } from '@justaname.id/react'
import { useMemo } from 'react'
import { useAuth } from '../useAuth'
import { ChainId } from '../../utils/types'

interface UseSubnameCheckResult {
    hasRequiredSubname: boolean
    connectedSubname: any | null
    allSubnames: any[]
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

    // const { 
    //     addressSubnames, 
    //     isAddressSubnamesPending, 
    //     isAddressSubnamesFetching,
    //     refetchAddressSubnames 
    // } = useAddressSubnames({
    //     address: walletAddress || undefined,
    //     chainId: chainId,
    //     isClaimed: true,
    //     enabled: shouldFetchSubnames
    // })


    const processedSubnames = useMemo(() => {
        const requiredSubnames: any[] = [];
        // ) || []

        return {
            allSubnames: [] as any[],
            requiredSubnames: requiredSubnames as any[],
            hasRequiredSubname: false
        }
    }, [ensName])

    const isLoading = useMemo(() => {
        if (!isAuthenticated || isAuthLoading) return true
        if (walletAddress && shouldFetchSubnames) {
            return false
        }
        return false
    }, [isAuthenticated, isAuthLoading, walletAddress, shouldFetchSubnames])

    const isError = !isAuthenticated && !isLoading

    return {
        hasRequiredSubname: processedSubnames.hasRequiredSubname,
        connectedSubname: processedSubnames.requiredSubnames[0],
        allSubnames: processedSubnames.allSubnames,
        isLoading,
        isError,
        walletAddress: walletAddress || null,
        refetch: () => {}
    }
}
