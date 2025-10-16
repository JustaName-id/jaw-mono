import { createSmartAccount } from "@/sdk/lib/justanaccount";
import { loginWithPasskey, storePasskeyAccountForLogin } from "@jaw.id/passkeys";
import { useMutation } from "@tanstack/react-query";
import { useAuth } from "../useAuth";
import { ChainId } from "@/utils/types";

export const usePasskeyLogin = () => {
  const { refetch } = useAuth();
  
  return useMutation({
    mutationFn: async () => {
        try {
            const passkeyCredential = await loginWithPasskey();
            if (!passkeyCredential) {
                throw new Error('No stored passkey found or authentication failed');
            }

            const smartAccount = await createSmartAccount(passkeyCredential, parseInt(process.env.NEXT_PUBLIC_CHAIN_ID!) as ChainId);
            const address = await smartAccount.getAddress();

            storePasskeyAccountForLogin(passkeyCredential, address);

            return {
                account: smartAccount,
                address,
                passkeyCredential,
                isLoggedIn: true
            };
            
        } catch (error) {
            console.error('Passkey login failed:', error);
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
