// import { createSmartAccount } from "@/sdk/lib/justanaccount";
import { loginWithSpecificPasskey, storeAuthState, addAccountToList, PasskeyAccount } from "@jaw.id/passkeys";
import { useMutation } from "@tanstack/react-query";
import { useAuth } from "../useAuth";
import { ChainId } from "../../utils/types";

interface LoginParams {
  credentialId: string;
  isImported?: boolean;
}

export const useLogin = () => {
  const { refetch } = useAuth();
  return useMutation({
    mutationFn: async ({ credentialId, isImported }: LoginParams) => {
        try {
            const passkeyCredential = await loginWithSpecificPasskey(credentialId);
            if (!passkeyCredential) {
                throw new Error('Passkey authentication failed');
            }

            // const smartAccount = await createSmartAccount(passkeyCredential, parseInt(process.env.NEXT_PUBLIC_CHAIN_ID!) as ChainId);
            // const address = await smartAccount.getAddress();

            // storeAuthState(address, passkeyCredential);

            // if(isImported) {
            //     const newAccount: PasskeyAccount = {
            //         credentialId: passkeyCredential.id,
            //         isImported: isImported,
            //         username: passkeyCredential.name,
            //         creationDate: new Date().toISOString(),
            //     };
                
            //     addAccountToList(newAccount);
            // }

            return {
                // account: smartAccount,
                account: null,
                // address,
                address: '0x1234567890123456789012345678901234567890',
                passkeyCredential,
                isLoggedIn: true
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
