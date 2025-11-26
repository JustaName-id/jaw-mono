import { useCallback, useState } from 'react';
import { Address } from 'viem';
import { useJAWProvider } from '../context';

export function useSignMessage() {
  const provider = useJAWProvider();
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const signMessage = useCallback(async (
    message: string,
    address?: Address
  ): Promise<string | null> => {
    setIsLoading(true);
    setError(null);

    try {
      // If address is not provided, get current account
      let signingAddress = address;
      if (!signingAddress) {
        const accounts = await provider.request({ method: 'eth_accounts' }) as Address[];
        if (!accounts[0]) {
          throw new Error('No connected account');
        }
        signingAddress = accounts[0];
      }

      const signature = await provider.request({
        method: 'personal_sign',
        params: [message, signingAddress],
      }) as string;

      return signature;
    } catch (err) {
      setError(err as Error);
      return null;
    } finally {
      setIsLoading(false);
    }
  }, [provider]);

  const signTypedData = useCallback(async (
    typedData: string | object,
    address?: Address
  ): Promise<string | null> => {
    setIsLoading(true);
    setError(null);

    try {
      // If address is not provided, get current account
      let signingAddress = address;
      if (!signingAddress) {
        const accounts = await provider.request({ method: 'eth_accounts' }) as Address[];
        if (!accounts[0]) {
          throw new Error('No connected account');
        }
        signingAddress = accounts[0];
      }

      const typedDataString = typeof typedData === 'string'
        ? typedData
        : JSON.stringify(typedData);

      const signature = await provider.request({
        method: 'eth_signTypedData_v4',
        params: [signingAddress, typedDataString],
      }) as string;

      return signature;
    } catch (err) {
      setError(err as Error);
      return null;
    } finally {
      setIsLoading(false);
    }
  }, [provider]);

  return {
    signMessage,
    signTypedData,
    isLoading,
    error,
  };
}