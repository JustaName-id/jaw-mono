import { useMutation } from "@tanstack/react-query";
import { Chain, PasskeyAccount } from "packages/core/src";
import { PasskeyService } from "../../lib/passkey-service";
import { useAuth } from "../useAuth";

interface LoginParams {
  chainId: Chain;
  credentialId: string;
  isImported?: boolean;
}

export const useLogin = () => {
  const { refetch } = useAuth();

  return useMutation({
    mutationFn: async ({ chainId, credentialId, isImported }: LoginParams) => {
        try {
            const service = new PasskeyService({ localOnly: true });
            const result = await service.authenticateWithPasskey(credentialId);

            if (!result) {
                throw new Error('Passkey authentication failed');
            }

            const smartAccount = await service.recreateSmartAccount(chainId);
            const address = await smartAccount.getAddress();

            service.storeAuthState(address, credentialId);

            return {
              account: smartAccount,
              address,
              passkeyCredential: result.account.credentialId,
              username: result.account.username,
              creationDate: result.account.creationDate
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
