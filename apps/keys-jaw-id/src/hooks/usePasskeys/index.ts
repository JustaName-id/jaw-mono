import { useQuery } from "@tanstack/react-query";
import { fetchAccountsFromLocalStorage, PasskeyAccount } from "@jaw.id/passkeys";

export interface LocalStorageAccount {
  username: string;
  creationDate: string;
  credentialId?: string;
  isImported?: boolean;
}

export const usePasskeys = () => {
  const query = useQuery<PasskeyAccount[]>({
    queryKey: ["PASSKEYS"],
    queryFn: fetchAccountsFromLocalStorage,
    staleTime: 0,
    gcTime: 0,
  });

  return {
    accounts: query.data || [],
    accountsLoading: query.isLoading,
    refetchAccounts: query.refetch,
  };
};
