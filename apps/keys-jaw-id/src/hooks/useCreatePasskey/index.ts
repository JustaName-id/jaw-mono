import { useMutation } from '@tanstack/react-query';
import { PasskeyService } from '../../lib/passkey-service';

export interface UseCreatePasskeyResult {
  address: string;
  credentialId: string;
  publicKey: `0x${string}`;
}

interface CreatePasskeyParams {
  username: string;
  apiKey?: string;
  defaultChainId?: number;
}

export function useCreatePasskey() {
  const mutation = useMutation({
    mutationFn: async ({ username, apiKey, defaultChainId }: CreatePasskeyParams): Promise<UseCreatePasskeyResult> => {
      const service = new PasskeyService({ apiKey, defaultChainId });
      const result = await service.createPasskey(username);

      return {
        address: result.address,
        credentialId: result.credentialId,
        publicKey: result.publicKey,
      };
    },
  });

  return {
    mutateAsync: mutation.mutateAsync,
    isPending: mutation.isPending,
    isError: mutation.isError,
    error: mutation.error,
  };
}
