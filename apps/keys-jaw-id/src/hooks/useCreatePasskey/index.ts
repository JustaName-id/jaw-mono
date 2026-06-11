import { useMutation } from '@tanstack/react-query';
import { PasskeyService } from '../../lib/passkey-service';
import { WEBAUTHN_IFRAME_UNSUPPORTED_EVENT, isWebAuthnIframeUnsupportedError } from '../../lib/embedded-ui';

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
      try {
        const result = await service.createPasskey(username);

        return {
          address: result.address,
          credentialId: result.credentialId,
          publicKey: result.publicKey,
        };
      } catch (error) {
        // This browser/extension cannot create credentials inside a
        // cross-origin iframe — let the embedded shell escape to a popup.
        if (isWebAuthnIframeUnsupportedError(error) && typeof window !== 'undefined') {
          window.dispatchEvent(new Event(WEBAUTHN_IFRAME_UNSUPPORTED_EVENT));
        }
        throw error;
      }
    },
  });

  return {
    mutateAsync: mutation.mutateAsync,
    isPending: mutation.isPending,
    isError: mutation.isError,
    error: mutation.error,
  };
}
