import { useCallback } from 'react';
import { useJAWProvider } from '../context';
import { useAddress } from './useAddress';
import { useChainId } from './useChainId';

export function useJAW() {
  const provider = useJAWProvider();
  const address = useAddress();
  const chainId = useChainId();

  const connect = useCallback(async () => {
    return provider.request({ method: 'eth_requestAccounts', params: [] });
  }, [provider]);

  const disconnect = useCallback(async () => {
    return provider.disconnect();
  }, [provider]);

  const switchChain = useCallback(async (chainId: number) => {
    return provider.request({
      method: 'wallet_switchEthereumChain',
      params: [{ chainId: `0x${chainId.toString(16)}` }],
    });
  }, [provider]);

  return {
    provider,
    address,
    chainId,
    isConnected: !!address,
    connect,
    disconnect,
    switchChain,
  };
}