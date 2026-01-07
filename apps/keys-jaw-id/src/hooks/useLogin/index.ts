import { useMutation } from "@tanstack/react-query";
import { Account, type Chain } from "@jaw.id/core";
import { useAuth } from "../useAuth";

interface LoginParams {
  chainId: Chain;
  credentialId: string;
  isImported?: boolean;
  apiKey?: string;
}

export const useLogin = () => {
  const { refetch } = useAuth();

  return useMutation({
    mutationFn: async ({ chainId, credentialId, apiKey }: LoginParams) => {
        try {
            // Use apiKey from params, fallback to env var
            const effectiveApiKey = apiKey

            if (!effectiveApiKey) {
              throw new Error('API key is required. Provide it via apiKey parameter or NEXT_PUBLIC_API_KEY environment variable.');
            }

            // Use Account.get which handles WebAuthn auth and smart account creation
            const account = await Account.get(
              {
                chainId: chainId.id,
                apiKey: effectiveApiKey,
                paymasterUrl: chainId.paymaster?.url,
              },
              credentialId
            );

            const metadata = account.getMetadata();
            const address = await account.getAddress();

            return {
              account,
              address,
              passkeyCredential: credentialId,
              username: metadata?.username || '',
              creationDate: metadata?.creationDate || new Date().toISOString()
            };
        } catch (error) {
            console.error('Login failed:', error);
            throw error;
        }
    },
    onSuccess: () => {
      refetch();
    },
    onError: (error) => {
      throw error;
    },
  });
};
