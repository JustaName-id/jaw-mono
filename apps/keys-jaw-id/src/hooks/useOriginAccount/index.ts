import { useQuery } from "@tanstack/react-query";
import { Account, type PasskeyAccount } from "@jaw.id/core";
import { SessionManager } from "../../lib/session-manager";

export type OriginAccountError = 'no_session' | 'credential_not_found' | 'restoration_failed';

export interface UseOriginAccountResult {
  account: Account | null;
  isLoading: boolean;
  error: OriginAccountError | null;
  credentialId: string | null;
  address: string | null;
}

interface RestoreAccountResult {
  account: Account | null;
  error: OriginAccountError | null;
  credentialId: string | null;
  address: string | null;
}

async function restoreOriginAccount(
  origin: string,
  chainId: number,
  apiKey: string
): Promise<RestoreAccountResult> {
  // 1. Get per-origin session
  const sessionManager = new SessionManager(origin);
  const session = sessionManager.checkAuth();

  if (!session.isAuthenticated || !session.credentialId) {
    return {
      account: null,
      error: 'no_session',
      credentialId: null,
      address: null,
    };
  }

  // 2. Find the stored account matching this credentialId
  const storedAccounts = Account.getStoredAccounts();
  const matchingAccount = storedAccounts.find(
    (acc: PasskeyAccount) => acc.credentialId === session.credentialId
  );

  if (!matchingAccount) {
    return {
      account: null,
      error: 'credential_not_found',
      credentialId: session.credentialId,
      address: session.address ?? null,
    };
  }

  // 3. Restore Account instance using the specific credential
  try {
    const account = await Account.fromStoredAccount(
      { chainId, apiKey },
      matchingAccount
    );
    return {
      account,
      error: null,
      credentialId: session.credentialId,
      address: session.address ?? null,
    };
  } catch {
    return {
      account: null,
      error: 'restoration_failed',
      credentialId: session.credentialId,
      address: session.address ?? null,
    };
  }
}

/**
 * Hook to get the correct Account instance for a given origin
 *
 * This hook looks up the per-origin session and restores the Account
 * using the stored credentialId, ensuring each dApp gets the account
 * it originally authenticated with.
 *
 * @param origin - The origin (dApp) to get the account for
 * @param chainId - The chain ID for the account
 * @param apiKey - The API key for JAW services
 * @returns The account instance, loading state, and any errors
 *
 * @example
 * ```tsx
 * const { account, isLoading, error } = useOriginAccount(origin, chainId, apiKey);
 *
 * if (error) {
 *   onReject({ code: 4901, message: `Session error: ${error}` });
 *   return;
 * }
 *
 * if (isLoading || !account) {
 *   return <Loading />;
 * }
 *
 * // Use account.signMessage(), account.sendTransaction(), etc.
 * ```
 */
export function useOriginAccount(
  origin: string | null,
  chainId: number,
  apiKey: string
): UseOriginAccountResult {
  const query = useQuery({
    queryKey: ['originAccount', origin, chainId, apiKey],
    queryFn: () => restoreOriginAccount(origin!, chainId, apiKey),
    enabled: !!origin && !!apiKey,
    staleTime: 0,
    gcTime: 0,
  });

  return {
    account: query.data?.account ?? null,
    isLoading: query.isLoading,
    error: query.data?.error ?? null,
    credentialId: query.data?.credentialId ?? null,
    address: query.data?.address ?? null,
  };
}
