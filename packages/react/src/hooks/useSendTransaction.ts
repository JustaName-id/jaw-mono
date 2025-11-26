import { useCallback, useState } from 'react';
import { Address } from 'viem';
import { useJAWProvider } from '../context';

export interface TransactionCall {
  to: string;
  value?: string;
  data?: string;
}

export interface SendTransactionResult {
  id: string;
  chainId: number;
}

export function useSendTransaction() {
  const provider = useJAWProvider();
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const sendTransaction = useCallback(async (
    calls: TransactionCall[],
    from?: Address
  ): Promise<SendTransactionResult | null> => {
    setIsLoading(true);
    setError(null);

    try {
      // If from address is not provided, get current account
      let fromAddress = from;
      if (!fromAddress) {
        const accounts = await provider.request({ method: 'eth_accounts' }) as Address[];
        if (!accounts[0]) {
          throw new Error('No connected account');
        }
        fromAddress = accounts[0];
      }

      // Get current chain ID
      const chainIdHex = await provider.request({ method: 'eth_chainId' }) as string;
      const chainId = parseInt(chainIdHex, 16);

      const result = await provider.request({
        method: 'wallet_sendCalls',
        params: [{
          version: '1.0',
          from: fromAddress,
          calls,
          chainId,
        }],
      }) as SendTransactionResult;

      return result;
    } catch (err) {
      setError(err as Error);
      return null;
    } finally {
      setIsLoading(false);
    }
  }, [provider]);

  return {
    sendTransaction,
    isLoading,
    error,
  };
}