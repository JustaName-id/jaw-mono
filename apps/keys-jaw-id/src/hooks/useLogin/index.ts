import { useMutation } from "@tanstack/react-query";
import { useAuth } from "../useAuth";
import { PasskeyService } from "../../lib/passkey-service";

interface LoginParams {
  credentialId: string;
  isImported?: boolean;
}

export const useLogin = () => {
  const { refetch } = useAuth();

  return useMutation({
    mutationFn: async ({ credentialId, isImported }: LoginParams) => {
        try {
            const service = new PasskeyService({ localOnly: true });
            const result = await service.authenticateWithPasskey(credentialId);

            if (!result) {
                throw new Error('Passkey authentication failed');
            }

            return {
                address: result.address,
                credentialId: result.credentialId,
                account: result.account,
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
