import { useQuery } from "@tanstack/react-query";
import { useCallback } from "react";
import { PasskeyAccount, Account } from "@jaw.id/core";
import { PasskeyService } from "../../lib/passkey-service";
import type { chain } from "../../lib/sdk-types";

export interface LocalStorageAccount {
  username: string;
  creationDate: string;
  credentialId?: string;
  isImported?: boolean;
}

// Function to fetch accounts using PasskeyService
const fetchAccountsFromLocalStorage = (apiKey?: string): PasskeyAccount[] => {
  const service = new PasskeyService({ apiKey });
  return service.fetchAccounts();
};

interface UsePasskeysOptions {
  apiKey?: string;
}

export const usePasskeys = (options?: UsePasskeysOptions) => {
  const { apiKey } = options || {};

  const query = useQuery<PasskeyAccount[]>({
    queryKey: ["PASSKEYS", apiKey],
    queryFn: () => fetchAccountsFromLocalStorage(apiKey),
    staleTime: 0,
    gcTime: 0,
  });

  const getAccount = useCallback(async (chain: chain, overrideApiKey?: string) => {
    const effectiveApiKey = overrideApiKey || apiKey || process.env.NEXT_PUBLIC_API_KEY;
    const account = await Account.restore({
      chainId: chain.id,
      apiKey: effectiveApiKey,
      paymasterUrl: chain.paymasterUrl,
    });
    return account;
  }, [apiKey]);

  // Legacy method - returns underlying smart account for backwards compatibility
  const getSmartAccount = useCallback(async (chain: chain, overrideApiKey?: string) => {
    const account = await getAccount(chain, overrideApiKey);
    return account.getSmartAccount();
  }, [getAccount]);

  return {
    accounts: query.data || [],
    accountsLoading: query.isLoading,
    refetchAccounts: query.refetch,
    getAccount,
    getSmartAccount,
  };
};
