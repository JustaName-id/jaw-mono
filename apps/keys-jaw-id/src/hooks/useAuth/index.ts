/**
 * useAuth Hook
 *
 * Provides authentication state for the popup.
 * Supports session-based auth (when origin is provided) for per-app connections.
 */

import { useQuery } from '@tanstack/react-query';
import { Account, type PasskeyAccount } from '@jaw.id/core';
import { sessionManager, type SessionAuthState, type AppSession } from '../../lib/session-manager';

// ============================================================================
// Types
// ============================================================================

export interface UseAuthOptions {
  /** App origin for session-based auth */
  origin?: string;
  /** API key for Account class operations */
  apiKey?: string;
}

export interface UseAuthReturn {
  // Query state
  isLoading: boolean;
  isError: boolean;
  isSuccess: boolean;
  refetch: () => Promise<unknown>;

  // Session state (for specific app)
  isAuthenticated: boolean;
  authState: SessionAuthState | null;
  session: AppSession | null;
  walletAddress: string | null;
  credentialId: string | null;
  publicKey: `0x${string}` | null;
  accountName: string | null;

  // Global state (all accounts)
  allAccounts: PasskeyAccount[];
  hasAccounts: boolean;
}

// ============================================================================
// Hook
// ============================================================================

export function useAuth(options: UseAuthOptions = {}): UseAuthReturn {
  const { origin, apiKey } = options;

  const query = useQuery({
    queryKey: ['auth', origin ?? 'global', apiKey ?? 'default'],
    queryFn: async () => {
      // Get global accounts
      const allAccounts = Account.getStoredAccounts(apiKey);

      // Get session state if origin provided
      const session = origin ? await sessionManager.getSession(origin) : null;
      const authState = session?.authState ?? null;

      // Check global authentication as fallback
      const globalAddress = Account.getAuthenticatedAddress(apiKey);
      const hasGlobalAuth = globalAddress !== null;

      // Prefer session-based auth if available, fallback to global auth
      const isAuthenticated = authState !== null || hasGlobalAuth;
      const effectiveAddress = authState?.address ?? globalAddress;
      const effectiveUsername = authState?.username ?? (hasGlobalAuth ? allAccounts[0]?.username : null);

      // Get credentialId and publicKey from stored accounts if no session but global auth exists
      let effectiveCredentialId = authState?.credentialId ?? null;
      let effectivePublicKey = authState?.publicKey ?? null;

      if (!authState && hasGlobalAuth && allAccounts.length > 0) {
        // Get the currently authenticated account (uses credentialId from auth state)
        const authenticatedAccount = Account.getCurrentAccount(apiKey);

        if (authenticatedAccount) {
          effectiveCredentialId = authenticatedAccount.credentialId;
          effectivePublicKey = authenticatedAccount.publicKey;
        }
      }

      return {
        // Session
        isAuthenticated,
        authState,
        session,
        walletAddress: effectiveAddress,
        credentialId: effectiveCredentialId,
        publicKey: effectivePublicKey,
        accountName: effectiveUsername,
        // Global
        allAccounts,
        hasAccounts: allAccounts.length > 0,
      };
    },
    staleTime: 0,
    gcTime: 0,
  });

  return {
    isLoading: query.isLoading,
    isError: query.isError,
    isSuccess: query.isSuccess,
    refetch: query.refetch,

    isAuthenticated: query.data?.isAuthenticated ?? false,
    authState: query.data?.authState ?? null,
    session: query.data?.session ?? null,
    walletAddress: query.data?.walletAddress ?? null,
    credentialId: query.data?.credentialId ?? null,
    publicKey: query.data?.publicKey ?? null,
    accountName: query.data?.accountName ?? null,

    allAccounts: query.data?.allAccounts ?? [],
    hasAccounts: query.data?.hasAccounts ?? false,
  };
}

export default useAuth;
