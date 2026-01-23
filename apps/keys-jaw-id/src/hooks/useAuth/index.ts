import { useQuery } from "@tanstack/react-query";
import { Account } from "@jaw.id/core";
import { SessionManager } from "../../lib/session-manager";


// Function to check auth using SessionManager for per-origin sessions
const checkAuth = (origin?: string) => {
    // If no origin provided, cannot check per-origin auth
    if (!origin) {
        return {
            isAuthenticated: false,
            address: null,
            accountName: undefined,
        };
    }

    const sessionManager = new SessionManager(origin);
    const session = sessionManager.checkAuth();

    // Get account name from global accounts list if authenticated
    let accountName: string | undefined;
    if (session.isAuthenticated && session.credentialId) {
        const accounts = Account.getStoredAccounts();
        // Find the account that matches the session's credential ID
        const account = accounts.find(a => a.credentialId === session.credentialId);
        accountName = account?.username;
    }

    return {
        isAuthenticated: session.isAuthenticated,
        address: session.address ?? null,
        accountName,
    };
};

export const useAuth = (origin?: string) => {
    const query = useQuery({
        queryKey: ["auth", origin],
        queryFn: () => checkAuth(origin),
        staleTime: 0,
        gcTime: 0,
        // Only enable when origin is provided
        enabled: !!origin,
    });

    return {
        isLoading: query.isLoading,
        isError: query.isError,
        isSuccess: query.isSuccess,
        isAuthenticated: query.data?.isAuthenticated ?? false,
        walletAddress: query.data?.address ?? null,
        accountName: query.data?.accountName,
        refetch: query.refetch,
    };
};
