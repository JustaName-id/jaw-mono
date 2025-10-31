import { useQuery } from "@tanstack/react-query";
import { useCallback } from "react";
import { PasskeyAccount } from "@jaw.id/core";
import { PasskeyService } from "../../lib/passkey-service";

export interface LocalStorageAccount {
  username: string;
  creationDate: string;
  credentialId?: string;
  isImported?: boolean;
}

// Function to fetch accounts using PasskeyService
const fetchAccountsFromLocalStorage = (): PasskeyAccount[] => {
  const service = new PasskeyService({ localOnly: true });
  return service.getAccounts();
};

export const usePasskeys = () => {
  const query = useQuery<PasskeyAccount[]>({
    queryKey: ["PASSKEYS"],
    queryFn: fetchAccountsFromLocalStorage,
    staleTime: 0,
    gcTime: 0,
  });

  const getSmartAccount = useCallback(async () => {
    const service = new PasskeyService({ localOnly: true });
    const smartAccount = await service.recreateSmartAccount();
    return smartAccount;
  }, []);

  return {
    accounts: query.data || [],
    accountsLoading: query.isLoading,
    refetchAccounts: query.refetch,
    getSmartAccount,
  };
};
