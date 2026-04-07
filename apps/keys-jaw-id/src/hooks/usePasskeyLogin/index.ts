import { useMutation } from '@tanstack/react-query';
import { useAuth } from '../useAuth';
import { PasskeyService } from '../../lib/passkey-service';

interface PasskeyLoginParams {
  apiKey?: string;
  defaultChainId?: number;
}

export const usePasskeyLogin = () => {
  const { refetch } = useAuth();

  return useMutation({
    mutationFn: async (params?: PasskeyLoginParams) => {
      try {
        const service = new PasskeyService({
          localOnly: true,
          apiKey: params?.apiKey,
          defaultChainId: params?.defaultChainId,
        });
        // Call without credentialId to use the first available passkey
        const result = await service.importPasskeyAccount();

        if (!result) {
          throw new Error('No stored passkey found or authentication failed');
        }

        return {
          address: result.address,
          credentialId: result.credentialId,
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
