/**
 * useSDKPasskey Hook
 * Integrates @jaw.id/passkeys with SDK flow
 */

import { useCallback } from 'react';
import {
  checkAuth,
  fetchAccountsFromLocalStorage,
  loginWithSpecificPasskey,
  storeAuthState,
  addAccountToList,
  type PasskeyAccount,
  type PasskeyCredential,
} from '@jaw.id/passkeys';
import { useAuth } from '../useAuth';
import { usePasskeys } from '../usePasskeys';

export interface PasskeyCheckResult {
  hasAccounts: boolean;
  isAuthenticated: boolean;
  currentAddress: string | null;
  accounts: PasskeyAccount[];
}

export interface PasskeyCreateResult {
  account: PasskeyAccount;
  address: string;
  credential: PasskeyCredential;
}

export interface PasskeyAuthResult {
  account: PasskeyAccount;
  address: string;
  credential: PasskeyCredential;
}

export interface UseSDKPasskeyReturn {
  /**
   * Check for existing passkeys and authentication status
   */
  checkPasskeys: () => Promise<PasskeyCheckResult>;

  /**
   * Create a new passkey
   * Note: Actual implementation needs to be completed
   */
  createPasskey: (username: string) => Promise<PasskeyCreateResult>;

  /**
   * Authenticate with an existing passkey
   */
  authenticate: (credentialId?: string) => Promise<PasskeyAuthResult>;

  /**
   * Get current authenticated account
   */
  getCurrentAccount: () => PasskeyAccount | null;

  /**
   * Sign a message with the current passkey
   * Note: Requires smart account integration
   */
  signMessage: (message: string) => Promise<string>;

  /**
   * Sign typed data with the current passkey
   * Note: Requires smart account integration
   */
  signTypedData: (typedData: any) => Promise<string>;
}

/**
 * Hook for passkey integration with SDK
 */
export function useSDKPasskey(): UseSDKPasskeyReturn {
  const { refetch: refetchAuth } = useAuth();
  const { refetchAccounts } = usePasskeys();

  /**
   * Check passkeys and authentication status
   */
  const checkPasskeys = useCallback(async (): Promise<PasskeyCheckResult> => {
    console.log('🔍 Checking for existing passkeys...');

    try {
      const authStatus = checkAuth();
      const accounts = fetchAccountsFromLocalStorage();

      console.log('✅ Passkey check complete:', {
        hasAccounts: accounts.length > 0,
        isAuthenticated: authStatus.isAuthenticated,
        accountCount: accounts.length,
      });

      return {
        hasAccounts: accounts.length > 0,
        isAuthenticated: authStatus.isAuthenticated,
        currentAddress: authStatus.address || null,
        accounts,
      };
    } catch (error) {
      console.error('❌ Failed to check passkeys:', error);
      return {
        hasAccounts: false,
        isAuthenticated: false,
        currentAddress: null,
        accounts: [],
      };
    }
  }, []);

  /**
   * Create a new passkey
   * TODO: This needs to be fully implemented with smart account creation
   */
  const createPasskey = useCallback(async (username: string): Promise<PasskeyCreateResult> => {
    console.log('🔑 Creating new passkey for:', username);

    try {
      // For now, throw error to indicate not implemented
      // The reference implementation creates a passkey credential and smart account here
      throw new Error('Passkey creation not yet implemented - see reference implementation');

      // Future implementation will:
      // 1. Create WebAuthn credential
      // 2. Create smart account with the credential
      // 3. Store in @jaw.id/passkeys format
      // 4. Return account and address

      // Example structure:
      // const credential = await createWebAuthnCredential(username);
      // const smartAccount = await createSmartAccount(credential);
      // const address = await smartAccount.getAddress();
      // const account: PasskeyAccount = { ... };
      // addAccountToList(account);
      // storeAuthState(address, credential);
      // return { account, address, credential };
    } catch (error) {
      console.error('❌ Failed to create passkey:', error);
      throw error;
    }
  }, []);

  /**
   * Authenticate with existing passkey
   */
  const authenticate = useCallback(async (credentialId?: string): Promise<PasskeyAuthResult> => {
    console.log('🔓 Authenticating with passkey...', { credentialId });

    try {
      let credential: PasskeyCredential;

      if (credentialId) {
        // Login with specific passkey
        credential = await loginWithSpecificPasskey(credentialId);
      } else {
        // Auto-select passkey (browser will show picker)
        const accounts = fetchAccountsFromLocalStorage();
        if (accounts.length === 0) {
          throw new Error('No passkeys found');
        }
        // Use first account's credential
        credential = await loginWithSpecificPasskey(accounts[0].credentialId);
      }

      if (!credential) {
        throw new Error('Passkey authentication failed');
      }

      console.log('✅ Passkey authentication successful');

      // TODO: Recreate smart account to get address
      // For now, use mock address
      const address = '0x1234567890123456789012345678901234567890';

      // Store auth state
      storeAuthState(address, credential);

      // Find the account
      const accounts = fetchAccountsFromLocalStorage();
      const account = accounts.find(acc => acc.credentialId === credential.id);

      if (!account) {
        throw new Error('Account not found after authentication');
      }

      // Refetch auth state
      await refetchAuth();

      return {
        account,
        address,
        credential,
      };
    } catch (error) {
      console.error('❌ Failed to authenticate:', error);
      throw error;
    }
  }, [refetchAuth]);

  /**
   * Get current authenticated account
   */
  const getCurrentAccount = useCallback((): PasskeyAccount | null => {
    const authStatus = checkAuth();
    if (!authStatus.isAuthenticated) {
      return null;
    }

    const accounts = fetchAccountsFromLocalStorage();
    // Return first account (in a real implementation, we'd match by address)
    return accounts[0] || null;
  }, []);

  /**
   * Sign a message with current passkey
   * TODO: Requires smart account integration
   */
  const signMessage = useCallback(async (message: string): Promise<string> => {
    console.log('✍️ Signing message with passkey...', { message });

    try {
      // TODO: Recreate smart account and sign
      // const smartAccount = await recreateSmartAccount();
      // const signature = await smartAccount.signMessage({ message });
      // return signature;

      throw new Error('Message signing not yet implemented - requires smart account');
    } catch (error) {
      console.error('❌ Failed to sign message:', error);
      throw error;
    }
  }, []);

  /**
   * Sign typed data with current passkey
   * TODO: Requires smart account integration
   */
  const signTypedData = useCallback(async (typedData: any): Promise<string> => {
    console.log('✍️ Signing typed data with passkey...', { typedData });

    try {
      // TODO: Recreate smart account and sign
      // const smartAccount = await recreateSmartAccount();
      // const signature = await smartAccount.signTypedData({ ... });
      // return signature;

      throw new Error('Typed data signing not yet implemented - requires smart account');
    } catch (error) {
      console.error('❌ Failed to sign typed data:', error);
      throw error;
    }
  }, []);

  return {
    checkPasskeys,
    createPasskey,
    authenticate,
    getCurrentAccount,
    signMessage,
    signTypedData,
  };
}
