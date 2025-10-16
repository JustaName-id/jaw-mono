import { checkAuth } from "@jaw.id/passkeys";
import { useQuery } from "@tanstack/react-query";

export const useAuth = () => {
    const query = useQuery({
        queryKey: ["auth"],
        queryFn: checkAuth,
    });
    return {
        isLoading: query.isLoading,
        isError: query.isError,
        isSuccess: query.isSuccess,
        isAuthenticated: query.data?.isAuthenticated,
        walletAddress: query.data?.address,
        refetch: query.refetch,
    };
};
