import { useMutation } from "@tanstack/react-query";
import { PasskeyService } from "../../lib/passkey-service";

export interface UseCreatePasskeyResult {
  address: string;
  credentialId: string;
}

export function useCreatePasskey() {
  const mutation = useMutation({
    mutationFn: async (username: string): Promise<UseCreatePasskeyResult> => {
      const service = new PasskeyService({ localOnly: true });
      const result = await service.createPasskey(username);

      return {
        address: result.address,
        credentialId: result.credentialId,
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
