import { useQuery } from "@tanstack/react-query";
import { Account } from "@jaw.id/core";


// Function to check auth using Account class
const checkAuth = () => {
    const address = Account.getAuthenticatedAddress();
    const isAuthenticated = address !== null;

    // Get account name from stored accounts if authenticated
    let accountName: string | undefined;
    if (isAuthenticated && address) {
        const accounts = Account.getStoredAccounts();
        // Find the account that matches the authenticated address
        // Note: We don't have direct address lookup, so we get the first account
        // In practice, the authenticated state stores the credential ID
        accountName = accounts[0]?.username;
    }

    return {
        isAuthenticated,
        address,
        accountName,
    };
};

export const useAuth = () => {
    const query = useQuery({
        queryKey: ["auth"],
        queryFn: checkAuth,
        staleTime: 0,
        gcTime: 0,
    });
    return {
        isLoading: query.isLoading,
        isError: query.isError,
        isSuccess: query.isSuccess,
        isAuthenticated: query.data?.isAuthenticated,
        walletAddress: query.data?.address,
        accountName: query.data?.accountName,
        refetch: query.refetch,
    };
};
