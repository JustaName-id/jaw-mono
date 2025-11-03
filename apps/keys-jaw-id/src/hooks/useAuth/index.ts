import { useQuery } from "@tanstack/react-query";
import { PasskeyService } from "../../lib/passkey-service";


// Function to check auth using PasskeyService
const checkAuth = () => {
    const service = new PasskeyService({ localOnly: true });
    const authResult = service.checkAuth();
    const currentAccount = service.getCurrentAccount();
    
    return {
        ...authResult,
        accountName: currentAccount?.username,
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
