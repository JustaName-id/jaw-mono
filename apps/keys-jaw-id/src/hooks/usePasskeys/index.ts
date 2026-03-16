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

  /**
   * Get account with WebAuthn authentication (triggers passkey prompt)
   * Use this for initial login/authentication
   */
  const getAccount = useCallback(async (chain: chain, credentialId: string, overrideApiKey?: string) => {
    // Add environment variable fallback
    const effectiveApiKey = overrideApiKey || apiKey || process.env.NEXT_PUBLIC_API_KEY;
    if (!effectiveApiKey) {
      throw new Error('API key is required. Provide it via apiKey parameter or NEXT_PUBLIC_API_KEY environment variable.');
    }
    if (!credentialId) {
      throw new Error('credentialId is required to get an account');
    }
    const account = await Account.get({
      chainId: chain.id,
      apiKey: effectiveApiKey,
      paymasterUrl: chain.paymaster?.url,
    }, credentialId);
    return account;
  }, [apiKey]);

  /**
   * Restore account WITHOUT triggering WebAuthn (no passkey prompt)
   * Use this when user has already authenticated and you just need the Account instance
   * The actual signing operation will trigger its own WebAuthn prompt
   */
  const restoreAccount = useCallback(async (
    chain: chain,
    credentialId: string,
    publicKey: `0x${string}`,
    overrideApiKey?: string
  ) => {
    const effectiveApiKey = overrideApiKey || apiKey;
    if (!effectiveApiKey) {
      throw new Error('API key is required. Provide it via apiKey parameter or NEXT_PUBLIC_API_KEY environment variable.');
    }
    if (!credentialId || !publicKey) {
      throw new Error('credentialId and publicKey are required to restore an account');
    }
    const account = await Account.restore({
      chainId: chain.id,
      apiKey: effectiveApiKey,
      paymasterUrl: chain.paymaster?.url,
    }, credentialId, publicKey);
    return account;
  }, [apiKey]);

  // Legacy method - returns underlying smart account for backwards compatibility
  const getSmartAccount = useCallback(async (chain: chain, credentialId: string, overrideApiKey?: string) => {
    const account = await getAccount(chain, credentialId, overrideApiKey);
    return account.getSmartAccount();
  }, [getAccount]);

  return {
    accounts: query.data || [],
    accountsLoading: query.isLoading,
    refetchAccounts: query.refetch,
    getAccount,
    restoreAccount,
    getSmartAccount,
  };
};
